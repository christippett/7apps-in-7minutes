module "app_engine_standard" {
  source     = "./standard"
  project_id = var.project_id

  service     = var.services.app_engine_standard.name
  description = var.services.app_engine_standard.description

  app_dir = var.app_dir

  domain         = var.services.app_engine_standard.domain
  cloud_dns_zone = var.cloud_dns_zone
}

module "app_engine_flexible" {
  source     = "./flexible"
  project_id = var.project_id


  service     = var.services.app_engine_flexible.name
  description = var.services.app_engine_flexible.description

  network_name = var.network_name
  subnet_name  = var.subnet_name
  image_name   = var.image_name

  domain         = var.services.app_engine_flexible.domain
  cloud_dns_zone = var.cloud_dns_zone
}

/* App Engine custom domains / URL routes ----------------------------------- */

# Define App Engine dispatch rules (URL routes). This allows us to assign
# custom domains for each App Engine service.

# https://cloud.google.com/appengine/docs/standard/python/reference/dispatch-yaml

resource "google_app_engine_application_url_dispatch_rules" "app" {
  project = var.project_id

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

/* Cloud Scheduler ---------------------------------------------------------- */

# Stop/start App Engine Flexible on a schedule

resource "google_cloud_scheduler_job" "stop_appengine_flex" {
  project     = var.project_id
  region      = var.region
  name        = "stop-appengine-flexible"
  description = "🕹️ Stop App Engine: Flexible service"
  schedule    = "45 */1 * * *" # attempt to stop App Engine service every hour to save on cost

  time_zone        = "Australia/Melbourne"
  attempt_deadline = "660s"

  http_target {
    http_method = "PATCH"

    uri = "https://appengine.googleapis.com/v1/${module.app_engine_flexible.version.id}?updateMask=servingStatus"
    body = base64encode(jsonencode({
      servingStatus = "STOPPED"
    }))

    headers = {
      Content-Type = "application/json"
    }

    oauth_token {
      service_account_email = var.cloud_scheduler_service_account
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }
}

resource "google_project_iam_member" "scheduler" {
  project = var.project_id
  role    = "roles/appengine.serviceAdmin"
  member  = "serviceAccount:${var.cloud_scheduler_service_account}"
}
