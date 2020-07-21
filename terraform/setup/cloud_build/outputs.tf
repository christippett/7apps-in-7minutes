output "cloud_build_trigger_id" {
  value = google_cloudbuild_trigger.deploy.id
}

output "cloud_build_topic" {
  value = google_pubsub_topic.logs
}
