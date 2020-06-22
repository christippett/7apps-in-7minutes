/* ========================================================================== */
/*                             App Engine Standard                            */
/* ========================================================================== */

data "archive_file" "app" {
  type        = "zip"
  source_dir = "${path.module}/../app"
  output_path = "${path.module}/../app.zip"
}

resource "google_storage_bucket_object" "app" {
  name   = basename(data.archive_file.app.output_path)
  bucket = google_storage_bucket.app.name
  source = data.archive_file.app.output_path
}

resource "google_app_engine_standard_app_version" "app" {
  project    = var.project_id
  service    = "standard"
  runtime    = "python37"
  version_id = "v1"

  instance_class = "F1"

  deployment {
    zip {
      source_url = google_storage_bucket_object.app.self_link
    }
  }

  automatic_scaling {
    max_concurrent_requests = 10
    standard_scheduler_settings {
      target_cpu_utilization = 0.5
      target_throughput_utilization = 0.75
      min_instances = 2
      max_instances = 5
    }
  }

  delete_service_on_destroy = true
}
