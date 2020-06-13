/* ========================================================================== */
/*                           Terraform Configuration                          */
/* ========================================================================== */

terraform {
  backend "remote" {
    hostname     = "app.terraform.io"
    organization = "servian-melbourne"

    workspaces {
      name = "7apps-redux"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

/* ========================================================================== */
/*                                 VPC Network                                */
/* ========================================================================== */

/* VPC ---------------------------------------------------------------------- */

module "vpc" {
  source  = "terraform-google-modules/network/google"
  version = "~> 2.3"

  project_id   = var.project_id
  network_name = var.network_name
  routing_mode = "GLOBAL"

    subnets = [
        {
            subnet_name   = var.subnetwork_name
            subnet_region = var.region
            subnet_ip     = "10.10.10.0/24"
        }
    ]
}

/* Serverless VPC Access ---------------------------------------------------- */

# https://cloud.google.com/vpc/docs/configure-serverless-vpc-access

resource "google_vpc_access_connector" "connector" {
  name          = "connector-${var.subnetwork_name}"
  project       = module.vpc.project_id
  network       = module.vpc.network_self_link
  region        = var.region
  ip_cidr_range = "10.2.0.0/24"
}

/* Private Services Access ------------------------------------------------ */

# https://cloud.google.com/vpc/docs/configure-private-services-access

resource "google_compute_global_address" "private_services_access" {
  network       = module.vpc.network_self_link
  name          = "ip-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 24
}

resource "google_service_networking_connection" "google_managed_services" {
  network                 = module.vpc.network_self_link
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.google_managed_services.name]
}


/* Firewall ----------------------------------------------------------------- */

module "firewall" {
  source                  = "terraform-google-modules/network/google//modules/fabric-net-firewall"

  project_id              = module.vpc.project_id
  network                 = module.vpc.network_name
  internal_ranges_enabled = true
  internal_ranges         = concat(
    module.vpc.subnets_ipstolist,
    tolist(google_vpc_access_connector.vpc_serverless_connector.ip_cidr_range)
  )
}

/* ========================================================================== */
/*                                  Cloud DNS                                 */
/* ========================================================================== */

locals {
  dns_name = "${var.domain_name}."
}

/* Managed Zone ------------------------------------------------------------- */

resource "google_dns_managed_zone" "dns" {
  name        = "7apps"
  description = "Public DNS zone for 7apps.servian.fun"
  dns_name    = local.dns_name
}

/* ========================================================================== */
/*                                  Cloud SQL                                 */
/* ========================================================================== */

locals {
  db_user     = "7apps"
  db_password = random_password.db_password.result
  db_name     = "7apps"
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

module "cloudsql" {
  source  = "GoogleCloudPlatform/sql-db/google//modules/postgresql"
  version = "3.2.0"

  name             = "postgres-db"
  project_id       = var.project_id
  region           = var.region
  zone             = "${var.region}-b"
  database_version = "POSTGRES_12"
  tier             = "e2-small"

  db_name       = local.db_name
  user_name     = local.db_user
  user_password = local.db_password

  ip_configuration = {
    ipv4_enabled        = true
    private_network     = module.vpc.network_self_link
    require_ssl         = false
    authorized_networks = []
  }

  module_depends_on = [google_service_networking_connection.google_managed_services]
}

/* ========================================================================== */
/*                                Cloud Storage                               */
/* ========================================================================== */

resource "google_storage_bucket" "bucket" {
  name = "7apps-bucket"
}

/* ========================================================================== */
/*                                 App Engine                                 */
/* ========================================================================== */

/* App ---------------------------------------------------------------------- */

resource "google_app_engine_application" "app" {
  project     = var.project_id
  location_id = var.region
}

/* Routing Rules ------------------------------------------------------------ */

# https://cloud.google.com/appengine/docs/standard/python/reference/dispatch-yaml

resource "google_app_engine_application_url_dispatch_rules" "app" {
  dispatch_rules {
    domain  = local.appengine_standard_domain
    path    = "/*"
    service = "standard"
  }

  dispatch_rules {
    domain  = local.appengine_flexible_domain
    path    = "/*"
    service = "flexible"
  }
}

/* Default Service (Monitoring Dashboard) ----------------------------------- */

resource "google_storage_bucket_object" "default" {
  name   = "hello-world.zip"
  bucket = google_storage_bucket.bucket.name
  source = "./test-fixtures/appengine/hello-world.zip"
}

resource "google_app_engine_standard_app_version" "default" {
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

  delete_service_on_destroy = true
}

/* DNS ---------------------------------------------------------------------- */

# https://cloud.google.com/appengine/docs/standard/python/mapping-custom-domains

resource "google_app_engine_domain_mapping" "dns_default" {
  domain_name = "gae.${var.domain_name}"

  ssl_settings {
    ssl_management_type = "AUTOMATIC"
  }
}

resource "google_app_engine_domain_mapping" "dns_wildcard" {
  domain_name = "*.gae.${var.domain_name}"

  ssl_settings {
    ssl_management_type = "AUTOMATIC"
  }
}

resource "google_dns_record_set" "appengine_default" {
  name         = "gae.${var.domain_name}."
  type         = google_app_engine_domain_mapping.dns_default.resource_records.type
  ttl          = 300
  managed_zone = google_dns_managed_zone.servian.name
  rrdatas      = google_app_engine_domain_mapping.dns_default.resource_records.rrdata
}

resource "google_dns_record_set" "appengine_wildcard" {
  name         = "*.gae.${var.domain_name}."
  type         = google_app_engine_domain_mapping.dns_wildcard.resource_records.type
  ttl          = 300
  managed_zone = google_dns_managed_zone.servian.name
  rrdatas      = google_app_engine_domain_mapping.dns_wildcard.resource_records.rrdata
}