/* Service: Standard -------------------------------------------------------- */

locals {
  source_bucket = "staging.${var.project_id}.appspot.com"
}

resource "google_app_engine_standard_app_version" "app" {
  project    = var.project_id
  service    = var.services.app_engine_standard.name
  runtime    = "python38"
  version_id = "v1"

  manual_scaling {
    instances = 1
  }

  entrypoint {
    shell = "gunicorn -b :$PORT main:app"
  }

  env_variables = {
    APP_TITLE = var.services.app_engine_standard.description
  }

  deployment {
    zip {
      source_url = "https://storage.googleapis.com/${local.source_bucket}/${google_storage_bucket_object.app_zip.name}"
    }
  }

  handlers {
    url_regex                   = ".*"
    security_level              = "SECURE_ALWAYS"
    redirect_http_response_code = "REDIRECT_HTTP_RESPONSE_CODE_301"
    script {
      script_path = "auto"
    }
  }

  delete_service_on_destroy = true

  # Ignore subsequent deployments after first Terraform apply
  lifecycle {
    ignore_changes = [version_id, deployment, handlers]
  }
}

/* Deployment Artifacts ----------------------------------------------------- */

data "archive_file" "app_zip" {
  type        = "zip"
  output_path = "${path.module}/.uploads/app.zip"

  dynamic "source" {
    for_each = fileset("${var.src_dir}/app", "**/*.{py,html,css,js,txt}")
    content {
      filename = source.value
      content  = file("${var.src_dir}/app/${source.value}")
    }
  }

  source {
    content  = "latest"
    filename = "commit_sha.txt"
  }
}

resource "google_storage_bucket_object" "app_zip" {
  name   = "app-${data.archive_file.app_zip.output_sha}.zip"
  bucket = local.source_bucket
  source = data.archive_file.app_zip.output_path
}

/* DNS ---------------------------------------------------------------------- */

# Configure custom domain

resource "google_app_engine_domain_mapping" "standard" {
  project     = var.project_id
  domain_name = var.services.app_engine_standard.domain

  ssl_settings {
    ssl_management_type = "AUTOMATIC"
  }

  depends_on = [google_app_engine_standard_app_version.app]
}

resource "google_dns_record_set" "app_engine_standard" {
  project      = google_app_engine_domain_mapping.standard.project
  name         = "${google_app_engine_domain_mapping.standard.domain_name}."
  managed_zone = var.cloud_dns_zone
  type         = "CNAME"
  rrdatas      = [var.google_dns]
  ttl          = 300
}
