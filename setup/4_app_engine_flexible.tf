/* ========================================================================== */
/*                             App Engine Flexible                            */
/* ========================================================================== */

resource "google_app_engine_flexible_app_version" "app" {
  project    = var.project_id
  service    = "flexible"
  runtime    = "custom"
  version_id = "v1"

  instance_class = "F1"

  deployment {
    container {
      image = var.container_image
    }
  }

  liveness_check {
    path = "/"
  }

  readiness_check {
    path = "/"
  }

  automatic_scaling {
    min_total_instances = 2
    max_total_instances = 5
    cool_down_period    = "120s"
    cpu_utilization {
      target_utilization = 0.5
    }
  }

  network {
    name         = google_compute_network.default.name
    subnetwork   = google_compute_subnetwork.default.name
    instance_tag = "appengine"
  }

  vpc_access_connector {
    name = google_vpc_access_connector.connector.id
  }

  delete_service_on_destroy = true
}

/* DNS ---------------------------------------------------------------------- */

resource "google_app_engine_domain_mapping" "flexible" {
  domain_name = "${var.appengine_flexible_subdomain}.${var.domain_name}"

  ssl_settings {
    ssl_management_type = "AUTOMATIC"
  }

  depends_on = [google_app_engine_flexible_app_version.app]
}

resource "google_dns_record_set" "appengine_flexible" {
  name         = "${var.appengine_flexible_subdomain}.${var.domain_name}."
  managed_zone = google_dns_managed_zone.dns.name
  type         = "CNAME"
  rrdatas      = ["ghs.googlehosted.com."]
  ttl          = 300
}
