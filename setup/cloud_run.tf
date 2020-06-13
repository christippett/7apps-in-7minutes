/* ========================================================================== */
/*                                  Cloud Run                                 */
/* ========================================================================== */

locals {
  cloudrun_managed_domain = "run.${var.domain_name}"
  cloudrun_anthos_domain = "run.gke.${var.domain_name}"
}

/* Cloud Run (Fully Managed) ------------------------------------------------ */

# https://cloud.google.com/run/docs/setup

resource "google_cloud_run_service" "app" {
  name     = "7apps-demo-app"
  project  = var.project_id
  location = var.region

  metadata {
    namespace = var.project_id
  }

  template {
    spec {
      containers {
        image = "gcr.io/cloudrun/hello"
      }
    }
  }
}

/* DNS ---------------------------------------------------------------------- */

# https://cloud.google.com/run/docs/mapping-custom-domains

resource "google_cloud_run_domain_mapping" "dns_managed" {
  name     = local.cloudrun_domain
  project  = var.project_id
  location = var.region

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_service.app.name
  }
}

resource "google_dns_record_set" "cloudrun" {
  name         = "${local.cloudrun_managed_domain}."
  type         = google_cloud_run_domain_mapping.dns.resource_records.type
  ttl          = 300
  managed_zone = google_dns_managed_zone.servian.name
  rrdatas      = google_cloud_run_domain_mapping.dns.resource_records.rrdata
}
