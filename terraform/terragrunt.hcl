
/* Backend ------------------------------------------------------------------ */

remote_state {
  backend = "gcs"

  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }

  config = {
    project  = local.project_id
    location = local.region
    bucket   = "${local.project_id}-terraform-state"
    prefix   = "${path_relative_to_include()}/terraform.tfstate"

    enable_bucket_policy_only = true
  }
}

/* Includes ----------------------------------------------------------------- */

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF

/* _______
  |____  /\
      / /  \   _ __  _ __  ___
     / / /\ \ | '_ \| '_ \/ __|
    / / ____ \| |_) | |_) \__ \
   /_/_/    \_\ .__/| .__/|___/
              | |   | |
              |_|   |_| ©2020 Servian */

/* Global variables --------------------------------------------------------- */

variable "project_id" { type = string }
variable "region" { type = string }
variable "zone" { type = string }
variable "app_dir" { type = string }

variable "domain" { type = string }
variable "email" { type = string }
variable "image_name" { type = string }

variable "services" {
  type = map(
    object({
      name        = string
      description = string
      domain      = string
    })
  )
}

/* Google Provider ---------------------------------------------------------- */

provider "google" {
  scopes = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/siteverification"
  ]
}

provider "google-beta" {
  scopes = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/siteverification"
  ]
}

/* Data --------------------------------------------------------------------- */

data "google_project" "project" {
  project_id = var.project_id
}

data "google_client_config" "default" {}

EOF
}

/* Locals ------------------------------------------------------------------- */

locals {
  project_id = "servian-labs-7apps"
  region     = "australia-southeast1"
  zone       = "australia-southeast1-a"
  domain     = "7apps.cloud"
  email      = "chris.tippett@servian.com"
  image      = "7apps-demo"

  root_dir = get_parent_terragrunt_dir()
}

/* Inputs ------------------------------------------------------------------- */

inputs = {
  project_id = local.project_id
  region     = local.region
  zone       = local.zone
  app_dir    = "${local.root_dir}/app"

  domain     = local.domain
  email      = local.email
  image_name = "gcr.io/${local.project_id}/${local.image}"

  github_owner  = "servian"
  github_repo   = "7apps-google-cloud"
  github_branch = "demo"


  services = {
    dashboard = {
      name        = "dashboard"
      description = "7-Apps Dashboard"
      domain      = local.domain
    }
    cloud_run = {
      name        = "run"
      description = "Cloud Run"
      domain      = "run.${local.domain}"
    }
    cloud_run_anthos = {
      name        = "run-anthos"
      description = "Cloud Run: Anthos"
      domain      = "run-anthos.${local.domain}"
    }
    cloud_function = {
      name        = "function"
      description = "Cloud Function"
      domain      = "function.${local.domain}"
    }
    app_engine_standard = {
      name        = "default"
      description = "App Engine: Standard"
      domain      = "standard.${local.domain}"
    }
    app_engine_flexible = {
      name        = "flexible"
      description = "App Engine: Flexible"
      domain      = "flex.${local.domain}"
    }
    compute_engine = {
      name        = "compute"
      description = "Compute Engine"
      domain      = "compute.${local.domain}"
    }
    kubernetes_engine = {
      name        = "gke-app"
      description = "Google Kubernetes Engine"
      domain      = "gke.${local.domain}"
    }
  }
}
