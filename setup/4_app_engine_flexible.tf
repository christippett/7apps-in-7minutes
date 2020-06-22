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
    cool_down_period = "120s"
    cpu_utilization {
      target_utilization = 0.5
    }
    request_utilization {
      target_request_count_per_second = 20
      target_concurrent_requests = 10
    }
  }

  network {
    name = google_compute_network.default.name
    subnetwork = google_compute_subnetwork.default.name
    instance_tag = "appengine"
  }

  vpc_access_connector {
    name = google_vpc_access_connector.connector.id
  }

  delete_service_on_destroy = true
}
