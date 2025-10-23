/* VPC ---------------------------------------------------------------------- */

# This network will be used primarily by Compute/Kubernetes Engine

resource "google_compute_network" "default" {
  project                 = var.project_id
  name                    = var.network_name
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "default" {
  project       = var.project_id
  name          = "${var.network_name}-subnet-${local.var.region_short}"
  ip_cidr_range = "10.10.10.0/24"
  network       = google_compute_network.default.self_link
  region        = var.region
}

/* Firewall ----------------------------------------------------------------- */

# Setup default firewall rules for HTTP, HTTPS and SSH

module "firewall" {
  source  = "terraform-google-modules/network/google//modules/fabric-net-firewall"
  version = "~> 3.3"

  project_id              = var.project_id
  network                 = google_compute_network.default.name
  internal_ranges_enabled = true
  internal_ranges         = [google_compute_subnetwork.default.ip_cidr_range]
  internal_allow          = [{ protocol = "tcp" }, { protocol = "icmp" }]
  custom_rules = {
    for k, v in var.firewall_rules : "${module.vpc.network_name}-${k}" => v
  }
}

