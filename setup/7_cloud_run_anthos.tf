/* ========================================================================== */
/*                             Cloud Run (Anthos)                             */
/* ========================================================================== */

# https://cloud.google.com/run/docs/gke/setup#create_private_cluster

locals {
  anthos_app_name = "run-anthos"
}

resource "null_resource" "cloud_run_anthos" {

  triggers = {
    cluster = google_container_cluster.gke.id
    image   = var.container_image
  }

  provisioner "local-exec" {
    command = <<EOT
gcloud run deploy ${local.anthos_app_name} \
  --platform gke \
  --cluster ${google_container_cluster.gke.name} \
  --cluster-location ${var.region}-a \
  --image ${var.container_image} && sleep 10
EOT
  }
}

/* DNS ---------------------------------------------------------------------- */

resource "google_dns_record_set" "cloudrun_anthos" {
  name         = "${var.cloud_run_anthos_subdomain}.${var.domain_name}."
  managed_zone = google_dns_managed_zone.dns.name
  type         = "A"
  rrdatas      = ["35.188.26.82"]
  ttl          = 300
}

# https://cloud.google.com/run/docs/mapping-custom-domains

# resource "google_cloud_run_domain_mapping" "anthos" {
#   name     = "${var.cloud_run_anthos_subdomain}.${var.domain_name}"
#   project  = var.project_id
#   location = var.region

#   metadata {
#     namespace = var.project_id
#   }

#   spec {
#     route_name = local.anthos_app_name
#   }

#   depends_on = [null_resource.cloud_run_anthos]
# }


/* TLS ---------------------------------------------------------------------- */

# https://cloud.google.com/run/docs/gke/auto-tls#enabling_automatic_tls_certificates_and_https

resource "kubernetes_config_map" "config-domainmapping" {
  metadata {
    name      = "config-domainmapping"
    namespace = "knative-serving"

    annotations = {
      "components.gke.io/component-name"    = "cloudrun"
      "components.gke.io/component-version" = "10.6.3"
    }

    labels = {
      "addonmanager.kubernetes.io/mode" : "Reconcile"
      "serving.knative.dev/release" : "v0.13.2-gke.3"
    }
  }

  data = {
    autoTLS = "Enabled"
  }

  lifecycle {
    ignore_changes = [data]
  }

  depends_on = [null_resource.cloud_run_anthos]
}
