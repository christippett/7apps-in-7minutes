
/* Service: Default --------------------------------------------------------- */

# A default App Engine service must be created before any other services -
#  we'll use this service to host the 7-Apps dashboard

locals {
  source_bucket = "staging.${var.project_id}.appspot.com"
}

data "archive_file" "dashboard_zip" {
  type        = "zip"
  output_path = "${path.module}/.uploads/dashboard.zip"

  dynamic "source" {
    for_each = fileset("${var.src_dir}/dashboard", "**/*.{py,html,css,js,txt}")
    content {
      filename = source.value
      content  = file("${var.src_dir}/dashboard/${source.value}")
    }
  }
}

resource "google_storage_bucket_object" "dashboard_zip" {
  name   = "dashboard-${data.archive_file.dashboard_zip.output_sha}.zip"
  bucket = local.source_bucket
  source = data.archive_file.dashboard_zip.output_path
}

resource "google_app_engine_standard_app_version" "dashboard" {
  project    = var.project_id
  service    = var.services.dashboard.name
  runtime    = "python38"
  version_id = "v1"

  env_variables = {
    CLOUD_RUN_URL          = "https://${var.services.cloud_run.domain}"
    CLOUD_RUN_ANTHOS_URL   = "https://${var.services.cloud_run_anthos.domain}"
    CLOUD_FUNCTIONS_URL    = "https://${var.services.cloud_function.domain}"
    APPENGINE_STANDARD_URL = "https://${var.services.app_engine_standard.domain}"
    APPENGINE_FLEXIBLE_URL = "https://${var.services.app_engine_flexible.domain}"
    COMPUTE_ENGINE_URL     = "https://${var.services.compute_engine.domain}"
    KUBERNETES_ENGINE_URL  = "https://${var.services.kubernetes_engine.domain}"
  }

  manual_scaling {
    instances = 1
  }

  entrypoint {
    shell = "gunicorn -b :$PORT main:app"
  }

  deployment {
    zip {
      source_url = "https://storage.googleapis.com/${local.source_bucket}/${google_storage_bucket_object.dashboard_zip.name}"
    }
  }

  handlers {
    url_regex = "/favicon\\.ico"
    static_files {
      path              = "static/favicon.ico"
      upload_path_regex = "static/favicon\\.ico"
    }
  }

  handlers {
    url_regex = "/static"
    static_files {
      path              = "static/.*"
      upload_path_regex = "static/.*"
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

  lifecycle {
    ignore_changes = [handlers]
  }
}

/* DNS ---------------------------------------------------------------------- */

# Configure domain mapping and DNS for the default service.
# (https://cloud.google.com/appengine/docs/standard/python/mapping-custom-domains)

resource "google_app_engine_domain_mapping" "default" {
  project     = var.project_id
  domain_name = var.services.dashboard.domain

  ssl_settings {
    ssl_management_type = "AUTOMATIC"
  }
}

resource "google_dns_record_set" "appengine_default_ip4" {
  project      = var.project_id
  name         = "${google_app_engine_domain_mapping.default.domain_name}."
  managed_zone = var.cloud_dns_zone
  type         = "A"
  ttl          = 300

  rrdatas = [
    for rr in google_app_engine_domain_mapping.default.resource_records :
    rr.rrdata if rr.type == "A"
  ]
}

resource "google_dns_record_set" "appengine_default_ip6" {
  project      = var.project_id
  name         = "${google_app_engine_domain_mapping.default.domain_name}."
  managed_zone = var.cloud_dns_zone
  type         = "AAAA"
  ttl          = 300

  rrdatas = [
    for rr in google_app_engine_domain_mapping.default.resource_records :
    rr.rrdata if rr.type == "AAAA"
  ]
}

/* App Engine custom domains / URL routes ----------------------------------- */

# Define App Engine dispatch rules (URL routes). This allows us to assign
# custom domains for each App Engine service.

# https://cloud.google.com/appengine/docs/standard/python/reference/dispatch-yaml

resource "google_app_engine_application_url_dispatch_rules" "app" {
  project = var.project_id

  dispatch_rules {
    path    = "/*"
    domain  = google_app_engine_domain_mapping.default.domain_name
    service = google_app_engine_standard_app_version.dashboard.service
  }

  dispatch_rules {
    path    = "/*"
    domain  = var.services.app_engine_standard.domain
    service = var.services.app_engine_standard.name
  }

  dispatch_rules {
    path    = "/*"
    domain  = var.services.app_engine_flexible.domain
    service = var.services.app_engine_flexible.name
  }
}
