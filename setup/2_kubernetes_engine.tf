/* ========================================================================== */
/*                       Google Kubernetes Engine (GKE)                       */
/* ========================================================================== */

# https://cloud.google.com/run/docs/gke/setup

resource "google_container_cluster" "gke" {
  provider = google-beta

  name       = "gke-7apps"
  location   = "${var.region}-a"
  project    = var.project_id
  subnetwork = google_compute_subnetwork.default.name
  network    = google_compute_network.default.name

  remove_default_node_pool = true
  initial_node_count       = 1 # will be replaced immediately upon cluster creation

  ip_allocation_policy {
    cluster_ipv4_cidr_block  = "172.16.0.0/17"   # 172.16.1.0 - 172.16.127.255
    services_ipv4_cidr_block = "172.16.128.0/17" # 172.16.128.0 - 172.16.255.255
  }

  addons_config {
    istio_config {
      disabled = false
    }

    http_load_balancing {
      disabled = false
    }

    cloudrun_config {
      disabled = false
    }
  }

  master_auth {
    client_certificate_config {
      issue_client_certificate = true
    }
  }

  master_authorized_networks_config {
    cidr_blocks {
      display_name = "Public"
      cidr_block   = "0.0.0.0/0"
    }
  }
}

resource "google_container_node_pool" "preemptible" {
  name               = "preemptible-pool"
  project            = google_container_cluster.gke.project
  location           = google_container_cluster.gke.location
  cluster            = google_container_cluster.gke.name
  initial_node_count = 3
  max_pods_per_node  = 50

  node_config {
    preemptible     = true
    machine_type    = "e2-standard-2"
    metadata        = { disable-legacy-endpoints = "true" }
    service_account = google_service_account.default.email
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]
  }
}

resource "google_compute_global_address" "gke_https_lb" {
  name = "ip-https-lb-gke"
}

/* DNS ---------------------------------------------------------------------- */

resource "google_dns_record_set" "gke" {
  name         = "${var.kubernetes_engine_subdomain}.${var.domain_name}."
  type         = "A"
  ttl          = 300
  managed_zone = google_dns_managed_zone.dns.name
  rrdatas      = [google_compute_global_address.gke_https_lb.address]
}
