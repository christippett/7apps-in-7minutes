
/* GKE Cluster -------------------------------------------------------------- */

# This cluster will be used for both Cloud Run on Anthos and hosting a vanilla
#  Kubernetes app.

# https://cloud.google.com/run/docs/gke/setup

resource "google_container_cluster" "gke" {
  provider = google-beta

  name               = "gke-cluster"
  min_master_version = "1.16.10-gke.8"
  location           = var.zone
  project            = var.project_id
  network            = var.network_name
  subnetwork         = var.subnet_name

  remove_default_node_pool = true
  initial_node_count       = 1

  networking_mode = "VPC_NATIVE"

  ip_allocation_policy {
    cluster_ipv4_cidr_block  = "172.16.0.0/17"
    services_ipv4_cidr_block = "172.16.128.0/17"
  }

  workload_identity_config {
    identity_namespace = "${var.project_id}.svc.id.goog"
  }

  addons_config {
    istio_config { disabled = false }
    http_load_balancing { disabled = false }
    cloudrun_config { disabled = false }
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

  lifecycle {
    ignore_changes = [ip_allocation_policy]
  }
}

resource "google_container_node_pool" "preemptible_nodes" {
  provider = google-beta

  project    = var.project_id
  name       = "preemptible-pool"
  location   = var.zone
  cluster    = google_container_cluster.gke.name
  node_count = 2

  node_config {
    preemptible  = true
    machine_type = "n2-standard-4"

    tags = ["ssh", "https-server", "http-server"]

    workload_metadata_config {
      node_metadata = "GKE_METADATA_SERVER"
    }

    metadata = {
      disable-legacy-endpoints = "true"
    }

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring",
      "https://www.googleapis.com/auth/devstorage.read_only",
      "https://www.googleapis.com/auth/service.management.readonly",
      "https://www.googleapis.com/auth/servicecontrol",
      "https://www.googleapis.com/auth/trace.append"
    ]
  }
}

/* DNS ---------------------------------------------------------------------- */

# Create a static IP and create a DNS A-record for it.

resource "google_compute_address" "gke" {
  project      = var.project_id
  region       = var.region
  name         = "ip-gke"
  network_tier = "PREMIUM"
}

resource "google_dns_record_set" "root" {
  project      = var.project_id
  name         = "${var.domain}."
  managed_zone = var.cloud_dns_zone
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_address.gke.address]
}

resource "google_dns_record_set" "gke" {
  project      = var.project_id
  name         = "${var.services.kubernetes_engine.domain}."
  managed_zone = var.cloud_dns_zone
  type         = "A"
  ttl          = 300
  rrdatas      = [google_compute_address.gke.address]
}

/* IAM ---------------------------------------------------------------------- */

data "google_compute_default_service_account" "default" {
  project = var.project_id
}

resource "google_project_iam_member" "default" {
  for_each = toset([
    "roles/gkehub.connect",
    "roles/container.hostServiceAgentUser",
    "roles/monitoring.metricWriter",
    "roles/logging.logWriter",
    "roles/cloudbuild.builds.editor"
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${data.google_compute_default_service_account.default.email}"

  lifecycle {
    ignore_changes = [member]
  }
}

# configure kubernetes service account
# https://cloud.google.com/run/docs/gke/setup#workload-identity

resource "google_service_account_iam_member" "kubernetes" {
  service_account_id = data.google_compute_default_service_account.default.name

  role   = "roles/iam.workloadIdentityUser"
  member = "serviceAccount:${var.project_id}.svc.id.goog[default/default]"

  depends_on = [
    google_container_cluster.gke,
    google_project_iam_member.default
  ]

  lifecycle {
    ignore_changes = [service_account_id]
  }
}

/* Traefik Ingress Controller ----------------------------------------------- */

resource "helm_release" "traefik" {
  repository = "https://containous.github.io/traefik-helm-chart"
  name       = "traefik"
  chart      = "traefik"
  version    = "8.9.1"
  atomic     = true
  timeout    = 300

  values = [yamlencode(
    {
      deployment = {
        initContainers = [
          {
            name  = "volume-permissions"
            image = "busybox:1.31.1"
            command : ["sh", "-c", "chmod -Rv 600 /data/*"]
            volumeMounts : [{ name = "data", "mountPath" : "/data" }]
          }
        ]
      }
      additionalArguments = [
        "--entrypoints.web.http.redirections.entryPoint.to=:443",
        "--entrypoints.web.http.redirections.entryPoint.scheme=https",
        "--entrypoints.websecure.http.tls=le",
        "--certificatesresolvers.le.acme.email=${var.email}",
        "--certificatesresolvers.le.acme.storage=/data/acme.json",
        "--certificatesresolvers.le.acme.httpchallenge=true",
        "--certificatesresolvers.le.acme.httpchallenge.entrypoint=web"
      ]
      persistence = {
        enabled = true
        path    = "/data"
      }
      service = {
        spec = {
          loadBalancerIP = google_compute_address.gke.address
        }
      }
    }
  )]

  depends_on = [
    google_container_cluster.gke,
    google_compute_address.gke
  ]
}
