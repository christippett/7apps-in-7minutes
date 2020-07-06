/* ========================================================================== */
/*                                   Project                                  */
/* ========================================================================== */

# Module:
# https://github.com/terraform-google-modules/terraform-google-project-factory/tree/master/modules/project_services

module "project-services" {
  source  = "terraform-google-modules/project-factory/google//modules/project_services"
  version = "4.0.0"

  project_id = var.project_id

  activate_apis = [
    "serviceusage.googleapis.com",
    "servicenetworking.googleapis.com",
    "vpcaccess.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "sql-component.googleapis.com",
    "storage-component.googleapis.com",
    "storage-api.googleapis.com",
    "containerregistry.googleapis.com",
    "cloudfunctions.googleapis.com",
    "cloudbuild.googleapis.com",
    "appengine.googleapis.com",
    "appengineflex.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    # Services required for Cloud Run on Anthos / GKE
    # https://cloud.google.com/anthos/multicluster-management/connect/prerequisites
    "cloudresourcemanager.googleapis.com",
    "container.googleapis.com",
    "anthos.googleapis.com",
    "gkeconnect.googleapis.com",
    "gkehub.googleapis.com"
  ]
}

/* ========================================================================== */
/*                                 VPC Network                                */
/* ========================================================================== */

/* VPC ---------------------------------------------------------------------- */

resource "google_compute_network" "default" {
  project = var.project_id
  name    = var.network_name

  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "default" {
  name                     = "${var.network_name}-subnet"
  ip_cidr_range            = "10.21.12.0/24"
  network                  = google_compute_network.default.self_link
  region                   = var.region
  private_ip_google_access = true
}

/* Firewall ----------------------------------------------------------------- */

# Module:
# https://github.com/terraform-google-modules/terraform-google-network/tree/master/modules/fabric-net-firewall

locals {
  firewall_allow_ranges = ["0.0.0.0/0"]
}

module "firewall" {
  source = "terraform-google-modules/network/google//modules/fabric-net-firewall"

  project_id = var.project_id
  network    = google_compute_network.default.name

  http_source_ranges  = local.firewall_allow_ranges
  https_source_ranges = local.firewall_allow_ranges
  ssh_source_ranges   = local.firewall_allow_ranges

  internal_ranges_enabled = true
  internal_ranges = flatten([
    google_compute_subnetwork.default.ip_cidr_range,
    google_container_cluster.gke.private_cluster_config.*.master_ipv4_cidr_block,
  ])
  internal_allow = [
    { "protocol" : "icmp" },
    { "protocol" : "tcp" }
  ]
}

/* ========================================================================== */
/*                                  Cloud DNS                                 */
/* ========================================================================== */

resource "google_dns_managed_zone" "dns" {
  name        = var.project_id
  description = "Public DNS zone for 7apps.servian.fun"
  dns_name    = "${var.domain_name}."
}

/* ========================================================================== */
/*                                 App Engine                                 */
/* ========================================================================== */

/* App ---------------------------------------------------------------------- */

resource "google_app_engine_application" "app" {
  project     = var.project_id
  location_id = replace(var.region, "us-central1", "us-central")
}

resource "google_storage_bucket" "app" {
  name               = "${var.project_id}-appengine"
  project            = var.project_id
  location           = var.region
  force_destroy      = true
  bucket_policy_only = true
}

/* Default Service (Monitoring Dashboard) ----------------------------------- */

data "archive_file" "monitoring_dashboard" {
  type        = "zip"
  source_dir  = "${path.module}/../dashboard"
  output_path = "${path.root}/.terraform/dashboard.zip"
}

resource "google_storage_bucket_object" "default" {
  name   = "dashboard-${data.archive_file.monitoring_dashboard.output_sha}.zip"
  bucket = google_storage_bucket.app.name
  source = data.archive_file.monitoring_dashboard.output_path
}

resource "google_app_engine_standard_app_version" "default" {
  project    = var.project_id
  service    = "default"
  runtime    = "python38"
  version_id = "initial"

  entrypoint {
    shell = "gunicorn -b :$PORT main:app"
  }


  deployment {
    zip {
      source_url = "https://storage.googleapis.com/${google_storage_bucket.app.name}/${google_storage_bucket_object.default.name}"
    }
  }

  basic_scaling {
    max_instances = 1
    idle_timeout  = "300s"
  }

  delete_service_on_destroy = true
  depends_on                = [google_app_engine_application.app]
}

/* Routing Rules ------------------------------------------------------------ */

# https://cloud.google.com/appengine/docs/standard/python/reference/dispatch-yaml

resource "google_app_engine_application_url_dispatch_rules" "app" {
  dispatch_rules {
    domain  = "${var.appengine_standard_subdomain}.${var.domain_name}"
    path    = "/*"
    service = "standard"
  }

  dispatch_rules {
    domain  = "${var.appengine_flexible_subdomain}.${var.domain_name}"
    path    = "/*"
    service = "flexible"
  }

  dispatch_rules {
    domain  = var.domain_name
    path    = "/*"
    service = "default"
  }

  depends_on = [google_app_engine_standard_app_version.default, google_app_engine_standard_app_version.app, google_app_engine_flexible_app_version.app]
}

/* DNS ---------------------------------------------------------------------- */

# https://cloud.google.com/appengine/docs/standard/python/mapping-custom-domains

resource "google_app_engine_domain_mapping" "default" {
  domain_name = var.domain_name
  ssl_settings {
    ssl_management_type = "AUTOMATIC"
  }

  depends_on = [google_app_engine_application.app]
}

resource "google_dns_record_set" "appengine_default_ip4" {
  name         = "${var.domain_name}."
  managed_zone = google_dns_managed_zone.dns.name
  type         = "A"
  ttl          = 300

  rrdatas = [
    for rr in google_app_engine_domain_mapping.default.resource_records : rr.rrdata if rr.type == "A"
  ]
}

resource "google_dns_record_set" "appengine_default_ip6" {
  name         = "${var.domain_name}."
  managed_zone = google_dns_managed_zone.dns.name
  type         = "AAAA"
  ttl          = 300

  rrdatas = [
    for rr in google_app_engine_domain_mapping.default.resource_records : rr.rrdata if rr.type == "AAAA"
  ]
}

/* ========================================================================== */
/*                                 Cloud Build                                */
/* ========================================================================== */

resource "google_cloudbuild_trigger" "deploy" {
  provider = google-beta
  project  = var.project_id
  name     = "DEPLOY-7-APPS"

  ignored_files = ["setup/**", "presentation/**"]
  filename      = "cloudbuild.yaml"

  github {
    owner = "servian"
    name  = "7apps7minutes"
    push {
      branch = "demo"
    }
  }
}
