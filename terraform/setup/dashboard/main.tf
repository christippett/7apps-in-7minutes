locals {
  env_vars = {
    CLOUD_RUN_URL               = "https://${var.services.cloud_run.domain}"
    CLOUD_RUN_ANTHOS_URL        = "https://${var.services.cloud_run_anthos.domain}"
    CLOUD_FUNCTIONS_URL         = "https://${var.services.cloud_function.domain}"
    APPENGINE_STANDARD_URL      = "https://${var.services.app_engine_standard.domain}"
    APPENGINE_FLEXIBLE_URL      = "https://${var.services.app_engine_flexible.domain}"
    COMPUTE_ENGINE_URL          = "https://${var.services.compute_engine.domain}"
    KUBERNETES_ENGINE_URL       = "https://${var.services.kubernetes_engine.domain}"
    CLOUD_BUILD_TRIGGER_ID      = var.cloud_build_trigger_id
    CLOUD_BUILD_SUBSCRIPTION_ID = google_pubsub_subscription.cloud_build_logs.id
    GITHUB_REPO                 = var.github_repo
    GITHUB_BRANCH               = var.github_branch
    DOMAIN                      = var.domain
  }
}

# Populate .env file for local development / testing

resource "local_file" "dot_env" {
  filename = "${var.src_dir}/dashboard/.env"
  content  = join("\n", [for k, v in local.env_vars : "${k}=${v}"])
}

/* Pub/Sub subscription to Cloud Build logs --------------------------------- */

resource "google_pubsub_subscription" "cloud_build_logs" {
  name  = "${var.cloud_build_topic.name}-subscription"
  topic = var.cloud_build_topic.name

  # 20 minutes
  message_retention_duration = "1200s"
  retain_acked_messages      = false

  ack_deadline_seconds = 20

  expiration_policy {
    ttl = "300000.5s"
  }
}

resource "google_pubsub_subscription_iam_binding" "cloud_build_logs" {
  subscription = google_pubsub_subscription.cloud_build_logs.name
  role         = "roles/editor"
  members = [
    "serviceAccount:service-${data.google_project.project.number}@gae-api-prod.google.com.iam.gserviceaccount.com"
  ]
}
