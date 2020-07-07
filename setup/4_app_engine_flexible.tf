/* ========================================================================== */
/*                             App Engine Flexible                            */
/* ========================================================================== */

resource "google_app_engine_flexible_app_version" "app" {
  project    = var.project_id
  service    = var.service.appengine_flexible.name
  runtime    = "custom"
  version_id = "v1"

  instance_class = "B1"

  env_variables = {
    ENVIRONMENT = var.service.appengine_flexible.description
  }

  deployment {
    container {
      image = "gcr.io/servian-7apps/7apps-app:latest"
    }
  }

  liveness_check {
    path = "/"
  }

  readiness_check {
    path = "/"
  }

  manual_scaling {
    instances = 1
  }

  network {
    name         = google_compute_network.default.name
    subnetwork   = google_compute_subnetwork.default.name
    instance_tag = "appengine"
  }

  delete_service_on_destroy = true
  lifecycle {
    ignore_changes = [version_id, serving_status]
  }
  depends_on = [null_resource.initial_container_build]
}

/* DNS ---------------------------------------------------------------------- */

resource "google_app_engine_domain_mapping" "flexible" {
  domain_name = "${var.service.appengine_flexible.subdomain}.${var.domain}"

  ssl_settings {
    ssl_management_type = "AUTOMATIC"
  }

  depends_on = [google_app_engine_flexible_app_version.app]
}

resource "google_dns_record_set" "appengine_flexible" {
  name         = "${var.service.appengine_flexible.subdomain}.${var.domain}."
  managed_zone = google_dns_managed_zone.dns.name
  type         = "CNAME"
  rrdatas      = [var.google_cname]
  ttl          = 300
}
