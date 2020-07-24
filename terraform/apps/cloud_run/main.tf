resource "google_cloud_run_service" "managed" {
  name     = var.services.cloud_run.name
  project  = var.project_id
  location = "us-central1" # domain mapping not yet available in Australia

  autogenerate_revision_name = true

  metadata {
    namespace = var.project_id
  }

  template {
    spec {

      containers {
        image = "${var.image_name}:latest"
        resources {
          limits = {
            cpu    = "1000m"
            memory = "128Mi"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template.0.spec.0.containers.0.image]
  }
}

/* IAM ---------------------------------------------------------------------- */

data "google_iam_policy" "noauth" {
  binding {
    role    = "roles/run.invoker"
    members = ["allUsers"]
  }
}

resource "google_cloud_run_service_iam_policy" "managed" {
  project     = google_cloud_run_service.managed.project
  location    = google_cloud_run_service.managed.location
  service     = google_cloud_run_service.managed.name
  policy_data = data.google_iam_policy.noauth.policy_data
}

/* DNS ---------------------------------------------------------------------- */

# https://cloud.google.com/run/docs/mapping-custom-domains

resource "google_cloud_run_domain_mapping" "managed" {
  project  = google_cloud_run_service.managed.project
  location = google_cloud_run_service.managed.location
  name     = var.services.cloud_run.domain

  metadata {
    namespace = google_cloud_run_service.managed.project
  }

  spec {
    route_name = google_cloud_run_service.managed.name
  }
}

resource "google_dns_record_set" "cloudrun_managed" {
  project      = google_cloud_run_service.managed.project
  name         = "${google_cloud_run_domain_mapping.managed.name}."
  managed_zone = var.cloud_dns_zone
  type         = "CNAME"
  rrdatas      = [var.google_dns]
  ttl          = 300
}
