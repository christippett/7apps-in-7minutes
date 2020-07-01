terraform {
  backend "remote" {
    hostname     = "app.terraform.io"
    organization = "servian-melbourne"

    workspaces {
      name = "7apps-redux"
    }
  }
}

/* Google Cloud ------------------------------------------------------------- */

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

/* Kubernetes --------------------------------------------------------------- */

data "google_client_config" "current" {}

provider "kubernetes" {
  load_config_file       = false
  token                  = data.google_client_config.current.access_token
  host                   = google_container_cluster.gke.endpoint
  cluster_ca_certificate = base64decode(google_container_cluster.gke.master_auth.0.cluster_ca_certificate)
}
