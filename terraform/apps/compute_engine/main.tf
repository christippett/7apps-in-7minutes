resource "google_compute_instance" "app" {
  name         = var.services.compute_engine.name
  project      = var.project_id
  zone         = var.zone
  machine_type = "e2-small"
  tags         = ["ssh", "http-server", "https-server", "webhook"]

  metadata = {
    user-data      = module.container.cloud_config
    enable-oslogin = true
  }

  boot_disk {
    initialize_params {
      image = data.google_compute_image.cos.self_link
    }
  }

  service_account {
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }

  network_interface {
    subnetwork         = var.subnet_name
    subnetwork_project = var.project_id
    access_config {
      nat_ip = google_compute_address.compute_engine.address
    }
  }

  scheduling {
    automatic_restart = true
  }

  allow_stopping_for_update = true

  lifecycle {
    ignore_changes = [attached_disk]
  }
}

/* Persistent disk ---------------------------------------------------------- */

# We're using Google's Container Optimized OS, which has a stateless filesystem.
#  We make use of a persistent disk to ensure we can keep our SSL certificates
#  between reboots.

resource "google_compute_disk" "app" {
  project = var.project_id
  name    = "persistent-disk"
  type    = "pd-standard"
  zone    = var.zone
  size    = 10
}

resource "google_compute_attached_disk" "app" {
  disk     = google_compute_disk.app.id
  instance = google_compute_instance.app.id
}

/* Setup container ----------------------------  ---------------------------- */

# With Compute Engine you have to do everything yourself! The Terraform module
# below takes care of most of things - it uses cloud-init to configure our
# instance so that it runs our container, including SSL and a webhook we can use
# during deployments to update the container image.

module "container" {
  source  = "christippett/container-server/cloudinit"
  version = "1.2.0-alpha.9"

  domain = var.services.compute_engine.domain
  email  = var.email

  enable_webhook = true

  container = {
    image       = "${var.image_name}:latest"
    environment = ["GCE_APP=1"]
  }

  cloudinit_part = [
    {
      content_type = "text/cloud-config"
      content      = local.cloudinit_extra
    }
  ]
}

# Add extra cloud-init config to enable Google Container Registry + setup disk.

locals {
  cloudinit_extra = <<EOT
#cloud-config

write_files:
  - path: /etc/systemd/system/gcr.service
    permissions: 0644
    content: |
      [Unit]
      Description=Configure Google Container Registry
      Before=docker.service

      [Service]
      Type=oneshot
      Environment=HOME=/run/app
      PassEnvironment=HOME
      ExecStart=/usr/bin/docker-credential-gcr configure-docker

      [Install]
      WantedBy=multi-user.target

runcmd:
  - systemctl enable --now gcr.service
bootcmd:
  - fsck.ext4 -tvy /dev/sdb || mkfs.ext4 /dev/sdb
  - mkdir -p /run/app
  - mount -o defaults -t ext4 /dev/sdb /run/app

EOT
}


/* DNS ---------------------------------------------------------------------- */

# Create a static IP and create a DNS A-record for it.

resource "google_compute_address" "compute_engine" {
  project      = var.project_id
  region       = var.region
  name         = "ip-compute-engine"
  network_tier = "PREMIUM"
}

resource "google_dns_record_set" "compute_engine" {
  project      = var.project_id
  name         = "${var.services.compute_engine.domain}."
  managed_zone = var.cloud_dns_zone
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_address.compute_engine.address]
}
