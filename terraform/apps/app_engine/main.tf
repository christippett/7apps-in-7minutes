module "app_engine_standard" {
  source     = "./standard"
  project_id = var.project_id

  service     = var.services.app_engine_standard.name
  description = var.services.app_engine_standard.description

  domain         = var.services.app_engine_standard.domain
  cloud_dns_zone = var.cloud_dns_zone
}

module "app_engine_flexible" {
  source     = "./flexible"
  project_id = var.project_id

  service      = var.services.app_engine_flexible.name
  description  = var.services.app_engine_flexible.description
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
