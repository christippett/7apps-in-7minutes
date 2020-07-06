/* ========================================================================== */
/*                               Compute Engine                               */
/* ========================================================================== */

module "container" {
  source  = "christippett/container-server/cloudinit"
  version = "1.2.0-alpha.3"

  domain = "${var.service.compute_engine.subdomain}.${var.domain}"
  email  = var.email

  enable_webhook = true

  container = {
    image = "gcr.io/${var.project_id}/7apps-app:latest"
    environment = [
      "ENVIRONMENT=Compute Engine"
    ]
  }

  files = [
    { filename = "users", content = base64encode("admin:$apr1$DvcU1VRX$prt1QwvJWSxGLohP9f8.l0") }
  ]

  env = {
    TRAEFIK_API_DASHBOARD = true
  }

  cloudinit_part = [{
    content_type = "text/cloud-config"
    content      = local.cloudinit_configure_gcr
  }]
}

# configure access to private gcr repositories
locals {
  cloudinit_configure_gcr = <<EOT
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

EOT
}


resource "google_compute_instance" "app" {
  name         = var.service.compute_engine.name
  project      = var.project_id
  zone         = "${var.region}-a"
  machine_type = "e2-small"
  tags         = ["ssh", "http-server", "https-server", "ops"]

  metadata = {
    user-data = module.container.cloud_config
  }

  boot_disk {
    initialize_params {
      image = data.google_compute_image.cos.self_link
    }
  }

  service_account {
    scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]
  }

  network_interface {
    subnetwork = google_compute_subnetwork.default.self_link
    access_config {
      nat_ip = google_compute_address.compute_engine.address
    }
  }

  allow_stopping_for_update = true
  lifecycle {
    ignore_changes = [attached_disk]
  }
}

/* System Images ------------------------------------------------------------ */

locals {
  cos_image    = "cos-cloud/cos-81-lts"
  ubuntu_image = "ubuntu-os-cloud/ubuntu-minimal-2004-lts"
}

data "google_compute_image" "ubuntu" {
  project = split("/", local.ubuntu_image)[0]
  family  = split("/", local.ubuntu_image)[1]
}

data "google_compute_image" "cos" {
  project = split("/", local.cos_image)[0]
  family  = split("/", local.cos_image)[1]
}


/* Disk --------------------------------------------------------------------- */

resource "google_compute_disk" "app" {
  project = var.project_id
  name    = "persistent-disk"
  type    = "pd-standard"
  zone    = "${var.region}-a"
  size    = 10
}

resource "google_compute_attached_disk" "default" {
  disk     = google_compute_disk.app.id
  instance = google_compute_instance.app.id
}

locals {
  cloudinit_disk = <<EOT
#cloud-config

bootcmd:
  - fsck.ext4 -tvy /dev/sdb || mkfs.ext4 /dev/sdb
  - mkdir -p /run/app
  - mount -o defaults -t ext4 /dev/sdb /run/app

EOT
}

/* DNS ---------------------------------------------------------------------- */

resource "google_compute_address" "compute_engine" {
  project      = var.project_id
  name         = "ip-compute-engine"
  network_tier = "PREMIUM"
}

resource "google_dns_record_set" "compute_engine" {
  name         = "${var.service.compute_engine.subdomain}.${var.domain}."
  managed_zone = google_dns_managed_zone.dns.name
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_address.compute_engine.address]
}

/* Deployment Token --------------------------------------------------------- */

resource "random_password" "deploy_token" {
  length           = 16
  special          = true
  override_special = "_%@"
}

resource "google_secret_manager_secret" "deploy_token" {
  project   = var.project_id
  secret_id = "deploy_token"

  replication {
    automatic = true
  }

  depends_on = [module.project-services]
}

resource "google_secret_manager_secret_version" "deploy_token" {
  secret      = google_secret_manager_secret.deploy_token.id
  secret_data = random_password.deploy_token.result
}
