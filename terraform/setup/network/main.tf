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
  source = "terraform-google-modules/network/google//modules/fabric-net-firewall"

  project_id = var.project_id
  network    = google_compute_network.default.name

  http_source_ranges  = ["0.0.0.0/0"]
  https_source_ranges = ["0.0.0.0/0"]
  ssh_source_ranges   = ["0.0.0.0/0"]

  internal_ranges_enabled = true
  internal_ranges = [
    google_compute_subnetwork.default.ip_cidr_range,
    "35.235.240.0/20" # IAP source IP range
  ]
  internal_allow = [
    { "protocol" : "icmp" },
    { "protocol" : "tcp" }
  ]

  custom_rules = {}
}

