/* ========================================================================== */
/*                          Cloud Run (Fully Managed)                         */
/* ========================================================================== */

# https://cloud.google.com/run/docs/setup

resource "google_cloud_run_service" "managed" {
  name     = var.service.cloud_run.name
  project  = var.project_id
  location = var.region

  autogenerate_revision_name = true

  metadata {
    namespace = var.project_id
  }

  template {
    spec {

      containers {
        image = "gcr.io/${var.project_id}/7apps-app:latest"
        env {
          name  = "ENVIRONMENT"
          value = var.service.cloud_run.description
        }
        resources {
          limits = {
            cpu    = "1000m"
            memory = "128Mi"
          }
        }
      }
    }
  }

  depends_on = [null_resource.initial_container_build]

  lifecyclye {
    ignore_changes = [template.0.spec.0.containers.0.image]
  }
}

/* IAM ---------------------------------------------------------------------- */

data "google_iam_policy" "noauth" {
  binding {
    role = "roles/run.invoker"
    members = [
      "allUsers",
    ]
  }
}

resource "google_cloud_run_service_iam_policy" "managed" {
  location = google_cloud_run_service.managed.location
  project  = google_cloud_run_service.managed.project
  service  = google_cloud_run_service.managed.name

  policy_data = data.google_iam_policy.noauth.policy_data
}

/* DNS ---------------------------------------------------------------------- */

# https://cloud.google.com/run/docs/mapping-custom-domains

resource "google_cloud_run_domain_mapping" "managed" {
  name     = "${var.service.cloud_run.subdomain}.${var.domain}"
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
  name         = "${var.service.cloud_run.subdomain}.${var.domain}."
  managed_zone = google_dns_managed_zone.dns.name
  type         = "CNAME"
  rrdatas      = [var.google_cname]
  ttl          = 300

  depends_on = [google_cloud_run_domain_mapping.managed]
}
