/* ========================================================================== */
/*                       Google Kubernetes Engine (GKE)                       */
/* ========================================================================== */

# https://cloud.google.com/run/docs/gke/setup

resource "google_container_cluster" "gke" {
  provider = google-beta

  name               = "gke"
  min_master_version = "1.16.8-gke.15"
  location           = "${var.region}-a"
  project            = var.project_id
  subnetwork         = google_compute_subnetwork.default.name
  network            = google_compute_network.default.name

  remove_default_node_pool = true
  initial_node_count       = 1

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

resource "google_container_node_pool" "preemptible_nodes" {
  provider = google-beta

  name       = "preemptible-pool"
  location   = "${var.region}-a"
  cluster    = google_container_cluster.gke.name
  node_count = 3

  node_config {
    preemptible  = true
    machine_type = "n2-standard-2"

    tags = ["ssh", "https-server", "http-server"]

    workload_metadata_config {
      node_metadata = "GKE_METADATA_SERVER"
    }

    metadata = {
      disable-legacy-endpoints = "true"
    }

    oauth_scopes = [
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

resource "google_compute_address" "gke_static_ip" {
  name = "gke-static-ip"
}

resource "google_dns_record_set" "gke" {
  name         = "${var.service.kubernetes_engine.subdomain}.${var.domain}."
  type         = "A"
  ttl          = 300
  managed_zone = google_dns_managed_zone.dns.name
  rrdatas      = [google_compute_address.gke_static_ip.address]
}

/* ========================================================================== */
/*                         Traefik Ingress Controller                         */
/* ========================================================================== */

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
        "--certificatesresolvers.le.acme.email=${var.email}",
        "--certificatesresolvers.le.acme.storage=/data/acme.json",
        "--certificatesresolvers.le.acme.httpchallenge=true",
        "--certificatesresolvers.le.acme.httpchallenge.entrypoint=web",
        "--entrypoints.web.http.redirections.entryPoint.to=:443",
        "--entrypoints.web.http.redirections.entryPoint.scheme=https",
        "--entrypoints.websecure.http.tls=le"
      ]
      persistence = {
        enabled = true
        path    = "/data"
      }
      service = {
        spec = {
          loadBalancerIP = google_compute_address.gke_static_ip.address
        }
      }
    }
  )]

  depends_on = [
    google_container_cluster.gke,
    google_compute_address.gke_static_ip
  ]
}

/* ========================================================================== */
/*                               App Deployment                               */
/* ========================================================================== */

resource "kubernetes_horizontal_pod_autoscaler" "app" {
  metadata {
    name = "7apps-autoscaler"
  }

  spec {
    max_replicas = 12
    min_replicas = 3

    scale_target_ref {
      kind = "Deployment"
      name = "gke-app-deployment"
    }
    metric {
      type = "Resource"
      resource {
        name = "cpu"
        target {
          type                = "Utilization"
          average_utilization = 50
        }
      }
    }
  }
}

resource "kubernetes_deployment" "app" {
  metadata {
    name = "gke-app-deployment"
  }
  spec {
    selector {
      match_labels = {
        app = "gke-app"
      }
    }
    template {
      metadata {
        labels = {
          app = "gke-app"
        }
      }
      spec {
        container {
          image = "gcr.io/${var.project_id}/${var.container_image_name}:latest"
          name  = "7apps-app"
          port {
            container_port = 8080
          }
          env {
            name  = "ENVIRONMENT"
            value = var.service.kubernetes_engine.description
          }
          resources {
            limits {
              cpu    = "250m"
              memory = "128Mi"
            }
          }
        }
      }
    }
  }
  depends_on = [google_container_cluster.gke]
  lifecycle {
    ignore_changes = [spec.0.template.0.spec.0.container.0.image]
  }
}

resource "kubernetes_service" "app" {
  metadata {
    name = "gke-app-service"
    labels = {
      app = "gke-app"
    }
  }
  spec {
    type = "ClusterIP"
    port {
      port = 8080
      name = "gke-app-port"
    }
    selector = {
      app = "gke-app"
    }
  }
  depends_on = [google_container_cluster.gke]
}

resource "null_resource" "app_ingress_route" {

  triggers = {
    ingress_route = base64encode(jsonencode({
      "apiVersion" = "traefik.containo.us/v1alpha1"
      "kind"       = "IngressRoute"
      "metadata" = {
        "name" = "app-https"
      }
      "spec" = {
        "entryPoints" = [
          "websecure",
        ]
        "routes" = [
          {
            "kind"  = "Rule"
            "match" = "Host(`${var.service.kubernetes_engine.subdomain}.${var.domain}`)"
            "services" = [
              {
                "name" = "gke-app-service"
                "port" = 8080
              },
            ]
          },
        ]
        "tls" = {
          "certResolver" = "le"
        }
      }
    }))
  }

  provisioner "local-exec" {
    when    = create
    command = "echo '${self.triggers.ingress_route}' | base64 -d | kubectl apply -f -"
  }

  provisioner "local-exec" {
    when    = destroy
    command = "echo '${self.triggers.ingress_route}' | base64 -d | kubectl delete -f -"
  }
}

