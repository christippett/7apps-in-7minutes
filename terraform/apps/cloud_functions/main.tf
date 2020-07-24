locals {
  source_bucket = "staging.${var.project_id}.appspot.com"
}

resource "google_cloudfunctions_function" "app" {
  project = var.project_id
  name    = var.services.cloud_function.name
  runtime = "python38"
  region  = "us-central1" # custom domain via Firebase doesn't work in Australia

  available_memory_mb   = 128
  source_archive_bucket = local.source_bucket
  source_archive_object = google_storage_bucket_object.function_zip.name
  trigger_http          = true
  entry_point           = "main"

  # lifecycle {
  #   ignore_changes = [source_archive_object, labels]
  # }
}

/* Deployment Artifacts ----------------------------------------------------- */

data "archive_file" "function_zip" {
  type        = "zip"
  output_path = "${path.module}/.uploads/function.zip"

  dynamic "source" {
    for_each = fileset("${var.app_dir}/src", "**/*.{py,html,txt,version}")
    content {
      filename = source.value
      content  = file("${var.app_dir}/src/${source.value}")
    }
  }
}

resource "google_storage_bucket_object" "function_zip" {
  name   = "function-${data.archive_file.function_zip.output_sha}.zip"
  bucket = local.source_bucket
  source = data.archive_file.function_zip.output_path
}

# Configure IAM and allow anyone to call the function

resource "google_cloudfunctions_function_iam_member" "invoker" {
  project        = google_cloudfunctions_function.app.project
  region         = google_cloudfunctions_function.app.region
  cloud_function = google_cloudfunctions_function.app.name

  role   = "roles/cloudfunctions.invoker"
  member = "allUsers"
}

/* DNS ---------------------------------------------------------------------- */

# Custom domain must be set up manually via Firebase and deployed via the
#  firebase CLI (https://firebase.google.com/docs/hosting/custom-domain)

# Firebase DNS records seem to be relatively static, so they're hard-coded here.
#  I've never seen anything other than the same two IPs used for A records.

resource "google_dns_record_set" "function" {
  project      = var.project_id
  name         = "${var.services.cloud_function.domain}."
  type         = "A"
  ttl          = 300
  managed_zone = var.cloud_dns_zone
  rrdatas      = var.firebase_dns
}

# Associate Cloud Function with Firebase (using Firebase Hosting)

resource "local_file" "firebase_config" {
  filename = "${path.module}/.terraform/firebase.json"
  content = jsonencode({
    hosting = {
      public = "."
      ignore = ["**"]
      rewrites = [
        {
          source   = "/"
          function = google_cloudfunctions_function.app.name
        }
      ]
    }
  })

  provisioner "local-exec" {
    working_dir = "${path.module}/.terraform"
    command     = "firebase deploy --project ${var.project_id}"
  }

  depends_on = [google_cloudfunctions_function.app]
}
