/* ========================================================================== */
/*                          Cloud Run (Fully Managed)                         */
/* ========================================================================== */

# https://cloud.google.com/run/docs/setup

resource "google_cloud_run_service" "managed" {
  name     = "7apps-app"
  project  = var.project_id
  location = var.region

  service_account_name = google_service_account.default.email


  metadata {
    namespace = var.project_id
  }

  template {
    spec {
      containers {
        image = var.container_image
      }
    }
  }
}

/* DNS ---------------------------------------------------------------------- */

# https://cloud.google.com/run/docs/mapping-custom-domains

resource "google_cloud_run_domain_mapping" "managed" {
  name     = "${var.cloud_run_managed_subdomain}.${var.domain_name}"
  project  = var.project_id
  location = var.region

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_service.managed.name
  }
}

resource "google_dns_record_set" "cloudrun_managed" {
  for_each     = google_cloud_run_domain_mapping.managed.status[0].resource_records

  name         = "${var.cloud_run_managed_subdomain}.${var.domain_name}."
  managed_zone = google_dns_managed_zone.dns.name
  type         = each.value.type
  rrdatas      = each.value.rrdata
  ttl          = 300

  depends_on = [google_cloud_run_domain_mapping.managed]
}
