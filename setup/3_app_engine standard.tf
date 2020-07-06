/* ========================================================================== */
/*                             App Engine Standard                            */
/* ========================================================================== */

data "archive_file" "app" {
  type        = "zip"
  source_dir  = "${path.module}/../app"
  output_path = "${path.root}/.terraform/app.zip"
}

resource "google_storage_bucket_object" "app" {
  name   = "app-${data.archive_file.app.output_sha}.zip"
  bucket = google_storage_bucket.app.name
  source = data.archive_file.app.output_path
}

resource "google_app_engine_standard_app_version" "app" {
  project    = var.project_id
  service    = var.service.appengine_standard.name
  runtime    = "python38"
  version_id = "v1"

  instance_class = "F1"

  entrypoint {
    shell = "gunicorn -b :$PORT main:app"
  }

  env_variables = {
    ENVIRONMENT = var.service.appengine_standard.description
  }


  deployment {
    zip {
      source_url = "https://storage.googleapis.com/${google_storage_bucket.app.name}/${google_storage_bucket_object.app.name}"
    }
  }

  automatic_scaling {
    max_concurrent_requests = 10
    standard_scheduler_settings {
      target_cpu_utilization        = 0.5
      target_throughput_utilization = 0.75
      min_instances                 = 2
      max_instances                 = 5
    }
  }

  delete_service_on_destroy = true
  lifecycle {
    ignore_changes = [version_id, deployment.source_url]
  }
}

/* DNS ---------------------------------------------------------------------- */

resource "google_app_engine_domain_mapping" "standard" {
  domain_name = "${var.service.appengine_standard.subdomain}.${var.domain}"

  ssl_settings {
    ssl_management_type = "AUTOMATIC"
  }

  depends_on = [google_app_engine_standard_app_version.app]
}

resource "google_dns_record_set" "appengine_standard" {
  name         = "${var.service.appengine_standard.subdomain}.${var.domain}."
  managed_zone = google_dns_managed_zone.dns.name
  type         = "CNAME"
  rrdatas      = [var.google_cname]
  ttl          = 300
}
