resource "google_compute_address" "demo_instance" {
  name = "demo-instance"
}

resource "google_compute_firewall" "demo_app_rule" {
  name    = "allow-demo-app"
  network = "${data.google_compute_network.default.name}"

  allow {
    protocol = "icmp"
  }

  allow {
    protocol = "tcp"
    ports    = ["80", "8080", "443"]
  }

  target_tags   = ["demo-app"]
  source_ranges = ["0.0.0.0/0"]
}

resource "google_compute_instance" "demo_instance" {
  name         = "demo-instance"
  machine_type = "f1-micro"
  zone         = "${local.zone}"

  boot_disk {
    initialize_params {
      image = "${module.gce-container.source_image}"
    }
  }

  metadata {
    "gce-container-declaration" = "${module.gce-container.metadata_value}"
  }

  labels {
    "container-vm" = "${module.gce-container.vm_container_label}"
  }

  network_interface {
    network = "${data.google_compute_network.default.name}"

    access_config {
      nat_ip = "${google_compute_address.demo_instance.address}"
    }
  }

  tags = ["demo-app"]

  service_account {
    scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]
  }

  lifecycle {
    ignore_changes = ["metadata"]
  }
}

module "gce-container" {
  source  = "github.com/terraform-google-modules/terraform-google-container-vm"
  version = "0.1.0"

  container = {
    image = "gcr.io/google-samples/hello-app:1.0"

    env = [
      {
        name  = "ENVIRONMENT"
        value = "Google Compute Engine"
      },
    ]
  }

  restart_policy = "Always"
}
