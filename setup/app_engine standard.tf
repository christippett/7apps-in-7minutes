/* ========================================================================== */
/*                                 App Engine                                 */
/* ========================================================================== */

locals {
  appengine_standard_domain = "standard.gae.${var.domain_name}"
}

/* App Engine Standard ------------------------------------------------------ */

resource "google_storage_bucket_object" "appengine" {
  name   = "hello-world.zip"
  bucket = google_storage_bucket.bucket.name
  source = "./test-fixtures/appengine/hello-world.zip"
}

resource "google_app_engine_standard_app_version" "app" {
  project    = var.project_id
  service    = "standard"
  runtime    = "python37"
  version_id = "v1"

  instance_class = "F1"

  deployment {
    zip {
      source_url = google_storage_bucket_object.source_code.self_link
    }
  }

  basic_scaling {
    max_instances = 5
    idle_timeout = 300
  }

  # automatic_scaling {
  #   max_concurrent_requests = 10
  #   standard_scheduler_settings {
  #     target_cpu_utilization = 0.5
  #     target_throughput_utilization = 0.75
  #     min_instances = 2
  #     max_instances = 5
  #   }
  # }

  delete_service_on_destroy = true
}
