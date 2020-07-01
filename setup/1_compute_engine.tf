/* ========================================================================== */
/*                               Compute Engine                               */
/* ========================================================================== */

module "container" {
  source  = "christippett/container-server/cloudinit"
  version = "1.0.3"

  domain            = "${var.compute_engine_subdomain}.${var.domain_name}"
  letsencrypt_email = var.email

  container = {
    image = var.container_image
    ports = ["8080"]
  }
}

resource "google_compute_instance" "app" {
  name         = "${var.project_id}-app"
  project      = var.project_id
  zone         = "${var.region}-a"
  machine_type = "e2-small"
  tags         = ["ssh", "http-server", "https-server"]

  metadata = {
    user-data = module.container.cloud_config
  }

  boot_disk {
    initialize_params {
      image = data.google_compute_image.cos.self_link
    }
  }

  service_account {
    email = google_service_account.default.email
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
}


data "google_compute_image" "cos" {
  project = "cos-cloud"
  family  = "cos-81-lts"
}

resource "google_compute_address" "compute_engine" {
  project      = var.project_id
  name         = "ip-compute-engine"
  network_tier = "PREMIUM"
}

/* DNS ---------------------------------------------------------------------- */

resource "google_dns_record_set" "compute_engine" {
  name         = "${var.compute_engine_subdomain}.${var.domain_name}."
  managed_zone = google_dns_managed_zone.dns.name
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_address.compute_engine.address]
}
