
/* Enable project services / APIs ------------------------------------------- */

module "project_services" {
  source  = "terraform-google-modules/project-factory/google//modules/project_services"
  version = "4.0.0"

  project_id = var.project_id

  activate_apis = [
    "compute.googleapis.com",
    "dns.googleapis.com",
    "siteverification.googleapis.com",
    "appengine.googleapis.com",
    "run.googleapis.com",
    "iap.googleapis.com",
    "webfonts.googleapis.com",
    "secretmanager.googleapis.com",
    "clouderrorreporting.googleapis.com",

    # These services are required by Cloud Run (Anthos)
    "cloudresourcemanager.googleapis.com",
    "container.googleapis.com",
    "anthos.googleapis.com",
    "gkehub.googleapis.com",
    "gkeconnect.googleapis.com"
  ]

  disable_services_on_destroy = true
}

/* Enable App Engine -------------------------------------------------------- */

# This enables App Engine and sets the default region. There's no way of
# deleting or updating an App Engine app once it's created - so make sure your
# preferred region is set.

resource "google_app_engine_application" "app" {
  project     = var.project_id
  location_id = var.region
}
