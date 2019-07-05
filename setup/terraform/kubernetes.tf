resource "google_compute_address" "k8s_static_ip" {
  name = "k8s-static-ip"
}

resource "google_container_cluster" "demo_cluster" {
  provider = "google-beta"

  name     = "demo-cluster"
  location = "${local.zone}"

  subnetwork = "${data.google_compute_subnetwork.default.self_link}"
  network    = "${data.google_compute_network.default.self_link}"

  # We can't create a cluster with no node pool defined, but we want to only use
  # separately managed node pools. So we create the smallest possible default
  # node pool and immediately delete it.
  remove_default_node_pool = true

  initial_node_count = 1

  ip_allocation_policy {
    use_ip_aliases = true
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

  lifecycle {
    ignore_changes = ["ip_allocation_policy"]
  }
}

resource "google_container_node_pool" "demo_cluster_preemptible_pool" {
  name       = "demo-preemptible-pool"
  location   = "${local.zone}"
  cluster    = "${google_container_cluster.demo_cluster.name}"
  node_count = 3

  node_config {
    preemptible  = true
    machine_type = "n1-standard-1"

    oauth_scopes = [
      "https://www.googleapis.com/auth/devstorage.read_only",
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring",
      "https://www.googleapis.com/auth/ndev.clouddns.readwrite",
    ]
  }
}
