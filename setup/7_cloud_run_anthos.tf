/* ========================================================================== */
/*                             Cloud Run (Anthos)                             */
/* ========================================================================== */

resource "null_resource" "cloud_run_anthos" {

  triggers = {
    name = var.service.cloud_run_anthos.name
    opts = join(" ", [
      "--namespace default",
      "--platform gke",
      "--cluster ${google_container_cluster.gke.name}",
      "--cluster-location ${var.region}-a"
    ])
    create_opts = join(" ", [
      "--service-account ${kubernetes_service_account.ksa.metadata.0.name}",
      "--set-env-vars 'ENVIRONMENT=${var.service.cloud_run_anthos.description}'",
      "--image gcr.io/${var.project_id}/${var.container_image_name}:latest"
    ])
  }

  provisioner "local-exec" {
    when    = create
    command = "gcloud run deploy ${self.triggers.name} ${self.triggers.opts} ${self.trigers.create_opts}"
  }

  provisioner "local-exec" {
    when    = destroy
    command = "gcloud run services delete ${self.triggers.name} ${self.triggers.opts}"
  }
}

/* DNS ---------------------------------------------------------------------- */

# configure auto-tls
# https://cloud.google.com/run/docs/gke/auto-tls

# kubectl patch cm config-domainmapping -n knative-serving -p '{"data":{"autoTLS":"Enabled"}}'

resource "google_dns_record_set" "cloudrun_anthos" {
  name         = "${var.service.cloud_run_anthos.subdomain}.${var.domain}."
  managed_zone = google_dns_managed_zone.dns.name
  type         = "A"
  rrdatas      = ["35.202.97.17"]
  ttl          = 300
}

# https://cloud.google.com/run/docs/mapping-custom-domains

# resource "google_cloud_run_domain_mapping" "anthos" {
#   name     = "${var.service.cloud_run_anthos.subdomain}.${var.domain}"
#   project  = var.project_id
#   location = "${var.region}-a"

#   metadata {
#     namespace = var.project_id
#   }

#   spec {
#     route_name = var.service.cloud_run_anthos.name
#   }

#   depends_on = [null_resource.cloud_run_anthos]
# }

/* IAM ---------------------------------------------------------------------- */

data "google_compute_default_service_account" "default" {
  depends_on = [module.project-services]
}

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

  lifecycle {
    ignore_changes = [member]
  }
}

# configure kubernetes service account
# https://cloud.google.com/run/docs/gke/setup#workload-identity

resource "kubernetes_service_account" "ksa" {
  metadata {
    name = "ksa"
    annotations = {
      "iam.gke.io/gcp-service-account" = data.google_compute_default_service_account.default.email
    }
  }
  depends_on = [google_container_cluster.gke]

  lifecycle {
    ignore_changes = [metadata.0.annotations]
  }
}

resource "google_service_account_iam_member" "ksa" {
  service_account_id = data.google_compute_default_service_account.default.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${kubernetes_service_account.ksa.metadata.0.namespace}/${kubernetes_service_account.ksa.metadata.0.name}]"

  depends_on = [google_container_cluster.gke]

  lifecycle {
    ignore_changes = [service_account_id]
  }
}
