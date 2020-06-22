/* ========================================================================== */
/*                               Compute Engine                               */
/* ========================================================================== */

resource "google_compute_instance" "app" {
  name         = "7apps-app"
  machine_type = "e2-medium"
  zone         = "${var.region}-a"

  boot_disk {
    initialize_params {
      image = module.container.source_image
    }
  }

  metadata = {
    gce-container-declaration = module.container.metadata_value
  }

  labels = {
    container-vm = module.container.vm_container_label
  }

  network_interface {
    subnetwork = google_compute_subnetwork.default.self_link
    access_config {
      nat_ip = google_compute_address.compute_engine.address
    }
  }

  tags = ["https", "http", "ssh"]

  service_account = google_service_account.default.email
  service_account {
    scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
    ]
  }

  allow_stopping_for_update = true
}

module "container" {
  source  = "terraform-google-modules/container-vm/google"
  version = "~> 2.0"

  container = {
    image = var.container_image

    env = [
      {
        name  = "ENVIRONMENT"
        value = "Google Compute Engine"
      },
    ]
  }

  restart_policy = "Always"
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
