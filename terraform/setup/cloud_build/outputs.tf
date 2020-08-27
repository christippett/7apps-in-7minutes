output "cloud_build_trigger_id" {
  value = google_cloudbuild_trigger.deploy.id
}

output "cloud_scheduler_service_account" {
  value = google_service_account.scheduler
}
