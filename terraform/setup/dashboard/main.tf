/* Cloud Tasks -------------------------------------------------------------- */

resource "google_cloud_tasks_queue" "default" {
  name = "background-task-queue"
  project = var.project_id
  location = var.region
}

/* Cloud Scheduler ---------------------------------------------------------- */

# Reset the app every half-hour

resource "google_cloud_scheduler_job" "reset" {
  project     = var.project_id
  region      = var.region
  name        = "reset-app"
  description = "🕹️ Reset application"
  schedule    = "30 */2 * * *"

  time_zone        = "Australia/Melbourne"
  attempt_deadline = "660s"

  http_target {
    http_method = "POST"

    uri = "https://cloudbuild.googleapis.com/v1/projects/${var.project_id}/triggers/${var.cloudbuild_trigger_id}:run"
    body = base64encode(jsonencode({
      repoName   = var.github_repo,
      branchName = var.github_branch
    }))

    headers = {
      Content-Type = "application/json"
    }

    oauth_token {
      service_account_email = google_service_account.scheduler.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }
}

/* Secrets Manager ---------------------------------------------------------- */

# Cloud Build Trigger ID

resource "google_secret_manager_secret" "cloud_build_trigger_id" {
  project   = var.project_id
  secret_id = "CLOUD_BUILD_TRIGGER_ID"
  replication { automatic = true }
}

resource "google_secret_manager_secret_version" "cloud_build_trigger_id" {
  secret      = google_secret_manager_secret.cloud_build_trigger_id.id
  secret_data = var.cloudbuild_trigger_id
}

# Cloud Tasks Queue Name

resource "google_secret_manager_secret" "cloud_tasks_queue_name" {
  project   = var.project_id
  secret_id = "CLOUD_TASKS_QUEUE_NAME"
  replication { automatic = true }
}

resource "google_secret_manager_secret_version" "cloud_tasks_queue_name" {
  secret      = google_secret_manager_secret.cloud_tasks_queue_name.id
  secret_data = google_cloud_tasks_queue.default.id
}

/* IAM ---------------------------------------------------------------------- */

data "google_compute_default_service_account" "default" {
  project = var.project_id
}

# Secrets access

locals {
  secrets = [
    "projects/${data.google_project.project.number}/secrets/GOOGLE_FONTS_API_KEY",
    google_secret_manager_secret.cloud_build_trigger_id.id,
    google_secret_manager_secret.cloud_tasks_queue_name.id
  ]
}

resource "google_secret_manager_secret_iam_member" "secret_access" {
  count     = length(local.secrets)
  project   = var.project_id
  secret_id = local.secrets[count.index]
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${data.google_compute_default_service_account.default.email}"
}

# Create a service account for Cloud Scheduler

resource "google_service_account" "scheduler" {
  account_id   = "cloud-scheduler"
  display_name = "🤖 Cloud Scheduler service account"
  description  = "🕹️️️ Application job scheduler"
  project      = var.project_id
}

resource "google_project_iam_member" "scheduler" {
  for_each = toset(["roles/cloudbuild.builds.editor", "roles/appengine.serviceAdmin"])
  project = var.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.scheduler.email}"
}
