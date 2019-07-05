locals {
  zone   = "australia-southeast1-b"
  region = "australia-southeast1"
}

provider "google" {
  project = "servian-app-demo"
  region  = "${local.region}"
}

provider "google-beta" {
  project = "servian-app-demo"
  region  = "${local.region}"
}

data "google_client_config" "current" {}

provider "kubernetes" {
  version                = ">= 1.5.0"
  load_config_file       = false
  token                  = "${data.google_client_config.current.access_token}"
  host                   = "${google_container_cluster.demo_cluster.endpoint}"
  cluster_ca_certificate = "${base64decode(google_container_cluster.demo_cluster.master_auth.0.cluster_ca_certificate)}"
}
