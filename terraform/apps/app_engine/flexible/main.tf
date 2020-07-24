
/* Service: Flexible -------------------------------------------------------- */

resource "google_app_engine_flexible_app_version" "app" {
  project        = var.project_id
  service        = var.service
  runtime        = "custom"
  version_id     = "initial"
  serving_status = "SERVING"

  manual_scaling {
    instances = 1
  }

  deployment {
    container {
      image = "${var.image_name}:latest"
    }
  }

  network {
    name       = var.network_name
    subnetwork = var.subnet_name
  }

  handlers {
    url_regex                   = ".*"
    security_level              = "SECURE_ALWAYS"
    redirect_http_response_code = "REDIRECT_HTTP_RESPONSE_CODE_301"
    auth_fail_action            = "AUTH_FAIL_ACTION_UNAUTHORIZED"
    login                       = "LOGIN_OPTIONAL"
    script {
      script_path = "auto"
    }
  }

  liveness_check {
    path = "/"
    host = var.domain
  }

  readiness_check {
    path = "/"
    host = var.domain
  }

  delete_service_on_destroy = true

  # Ignore subsequent deployments after Terraform apply
  lifecycle {
    ignore_changes = [version_id, serving_status, deployment]
  }
}

/* DNS ---------------------------------------------------------------------- */

resource "google_app_engine_domain_mapping" "flexible" {
  project     = var.project_id
  domain_name = var.domain

  ssl_settings {
    ssl_management_type = "AUTOMATIC"
  }

  depends_on = [google_app_engine_flexible_app_version.app]
}

resource "google_dns_record_set" "appengine_flexible" {
  project      = var.project_id
  name         = "${google_app_engine_domain_mapping.flexible.domain_name}."
  managed_zone = var.cloud_dns_zone
  type         = "CNAME"
  rrdatas      = ["${var.google_cname}"]
  ttl          = 300
}
