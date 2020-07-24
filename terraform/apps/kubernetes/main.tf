provider "kubernetes" {
  load_config_file       = false
  token                  = data.google_client_config.default.access_token
  host                   = var.cluster_endpoint
  cluster_ca_certificate = base64decode(var.cluster_ca_certificate)
}

resource "kubernetes_deployment" "app" {
  metadata {
    name = var.services.kubernetes_engine.name
  }
  spec {
    selector {
      match_labels = {
        app = var.services.kubernetes_engine.name
      }
    }
    template {
      metadata {
        labels = {
          app = var.services.kubernetes_engine.name
        }
      }
      spec {
        container {
          image = "${var.image_name}:latest"
          name  = var.services.kubernetes_engine.name
          port {
            container_port = 8080
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

  lifecycle {
    ignore_changes = [spec.0.template.0.spec.0.container.0.image]
  }
}

resource "kubernetes_service" "app" {
  metadata {
    name = "${var.services.kubernetes_engine.name}-service"
    labels = {
      app = var.services.kubernetes_engine.name
    }
  }
  spec {
    type = "ClusterIP"
    port {
      port = 8080
      name = "${var.services.kubernetes_engine.name}-port"
    }
    selector = {
      app = var.services.kubernetes_engine.name
    }
  }
}

resource "null_resource" "app_ingress_route" {
  triggers = {
    service = kubernetes_service.app.id
    ingress_route = base64encode(jsonencode({
      apiVersion = "traefik.containo.us/v1alpha1"
      kind       = "IngressRoute"
      metadata = {
        name = "${var.services.kubernetes_engine.name}-https"
      }
      spec = {
        entryPoints = ["websecure"]
        tls         = { certResolver = "le" }
        routes = [
          {
            kind  = "Rule"
            match = "Host(`${var.services.kubernetes_engine.domain}`)"
            services = [
              {
                name = "${var.services.kubernetes_engine.name}-service"
                port = 8080
              },
            ]
          },
        ]
      }
    }))
  }

  provisioner "local-exec" {
    command = "echo '${self.triggers.ingress_route}' | base64 -d | kubectl apply -f -"
  }

  provisioner "local-exec" {
    when    = destroy
    command = "echo '${self.triggers.ingress_route}' | base64 -d | kubectl delete -f - || true"
  }
}

