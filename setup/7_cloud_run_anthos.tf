/* ========================================================================== */
/*                             Cloud Run (Anthos)                             */
/* ========================================================================== */

# https://cloud.google.com/run/docs/gke/setup#create_private_cluster

resource "google_cloud_run_service" "anthos" {
  name     = "7apps-app-anthos"
  project  = var.project_id
  location = var.region


  metadata {
    namespace = var.project_id
  }

  template {
    spec {
      service_account_name = google_service_account.default.email
      containers {
        image = var.container_image
      }
    }
  }
}

/* DNS ---------------------------------------------------------------------- */

# https://cloud.google.com/run/docs/mapping-custom-domains

resource "google_cloud_run_domain_mapping" "anthos" {
  name     = "${var.cloud_run_anthos_subdomain}.${var.domain_name}"
  project  = var.project_id
  location = var.region

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_service.anthos.name
  }
}

resource "google_dns_record_set" "cloudrun_anthos" {
  for_each     = google_cloud_run_domain_mapping.anthos.status[0].resource_records

  name         = "${var.cloud_run_anthos_subdomain}.${var.domain_name}."
  managed_zone = google_dns_managed_zone.dns.name
  type         = each.value.type
  rrdatas      = each.value.rrdata
  ttl          = 300

  depends_on = [google_cloud_run_domain_mapping.anthos]
}


/* TLS ---------------------------------------------------------------------- */

# https://cloud.google.com/run/docs/gke/auto-tls#enabling_automatic_tls_certificates_and_https

resource "kubernetes_config_map" "config-domainmapping" {
  metadata {
    name = "config-domainmapping"
    namespace = "knative-serving"

    annotations = {
      "components.gke.io/component-name" = "cloudrun"
      "components.gke.io/component-version" = "10.4.1"
    }

    labels = {
      "addonmanager.kubernetes.io/mode": "Reconcile"
      "serving.knative.dev/release": "v0.11.0-gke.9"
    }
  }

  data = {
    autoTLS = "Enabled"
  }

}