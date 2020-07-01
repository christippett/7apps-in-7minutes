/* ========================================================================== */
/*                       Google Kubernetes Engine (GKE)                       */
/* ========================================================================== */

# https://cloud.google.com/run/docs/gke/setup

resource "google_container_cluster" "gke" {
  provider = google-beta

  name               = "gke-7apps"
  min_master_version = "1.16.8-gke.15"
  location           = "${var.region}-a"
  project            = var.project_id
  subnetwork         = google_compute_subnetwork.default.name
  network            = google_compute_network.default.name

  remove_default_node_pool = true
  initial_node_count       = 1 # will be replaced immediately upon cluster creation

  ip_allocation_policy {
    cluster_ipv4_cidr_block  = "172.16.0.0/17"   # 172.16.1.0 - 172.16.127.255
    services_ipv4_cidr_block = "172.16.128.0/17" # 172.16.128.0 - 172.16.255.255
  }

  workload_identity_config {
    identity_namespace = "${var.project_id}.svc.id.goog"
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
  version            = "1.16.8-gke.15"

  node_config {
    preemptible  = true
    machine_type = "n1-standard-1"
    metadata     = { disable-legacy-endpoints = "true" }
    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }
}

/* IAM ---------------------------------------------------------------------- */

data "google_compute_default_service_account" "default" {}

resource "google_project_iam_member" "compute_default" {
  for_each = toset([
    "roles/gkehub.connect",
    "roles/container.hostServiceAgentUser",
    "roles/monitoring.metricWriter",
    "roles/logging.logWriter"
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${data.google_compute_default_service_account.default.email}"
}

resource "kubernetes_cluster_role_binding" "gke" {
  metadata {
    name = "admins"
  }
  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "ClusterRole"
    name      = "cluster-admin"
  }
  subject {
    kind      = "User"
    name      = data.google_compute_default_service_account.default.email
    api_group = "rbac.authorization.k8s.io"
  }
  subject {
    kind      = "User"
    name      = var.email
    namespace = "rbac.authorization.k8s.io"
  }
}

# /* DNS ---------------------------------------------------------------------- */

resource "google_compute_global_address" "gke_https_lb" {
  name = "ip-https-lb-gke"
}

resource "google_dns_record_set" "gke" {
  name         = "${var.kubernetes_engine_subdomain}.${var.domain_name}."
  type         = "A"
  ttl          = 300
  managed_zone = google_dns_managed_zone.dns.name
  rrdatas      = [google_compute_global_address.gke_https_lb.address]
}

/* ========================================================================== */
/*                       Caddy Server Ingress Controller                      */
/* ========================================================================== */

# Automatic SSL/TLS certificates through Let's Encrypt
# https://github.com/caddyserver/ingress


resource "kubernetes_namespace" "caddy" {
  metadata {
    name = "caddy-system"
  }
  depends_on = [google_container_cluster.gke]
}

resource "helm_release" "caddy" {
  name       = "caddy-ingress"
  namespace  = "caddy-system"
  repository = "https://caddyserver.github.io/ingress/"
  chart      = "caddy-ingress-controller"
  atomic     = true

  set {
    name  = "image.tag"
    value = "latest"
  }

  set {
    name  = "ingressController.autotls"
    value = true
  }

  set {
    name  = "ingressController.email"
    value = var.email
  }


  set {
    name  = "service.loadBalancerIP"
    value = google_compute_global_address.gke_https_lb.address
  }

  depends_on = [google_container_cluster.gke]
}
