/* ========================================================================== */
/*                               Cloud Functions                              */
/* ========================================================================== */

resource "google_cloudfunctions_function" "app" {
  name    = var.service.cloud_functions.name
  runtime = "python37"

  available_memory_mb   = 128
  source_archive_bucket = google_storage_bucket.app.name
  source_archive_object = google_storage_bucket_object.app.name
  trigger_http          = true
  entry_point           = "greeting"

  environment_variables = {
    ENVIRONMENT = var.service.cloud_functions.description
  }
}

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
}

# IAM entry for all users to invoke the function
resource "google_cloudfunctions_function_iam_member" "invoker" {
  project        = google_cloudfunctions_function.app.project
  region         = google_cloudfunctions_function.app.region
  cloud_function = google_cloudfunctions_function.app.name

  role   = "roles/cloudfunctions.invoker"
  member = "allUsers"
}

/* ========================================================================== */
/*                                     DNS                                    */
/* ========================================================================== */

# Custom domain must be set up manually through Firebase
# https://firebase.google.com/docs/hosting/custom-domain

resource "google_dns_record_set" "function" {
  name         = "${var.service.cloud_functions.subdomain}.${var.domain}."
  type         = "A"
  ttl          = 300
  managed_zone = google_dns_managed_zone.dns.name
  rrdatas      = var.firebase_nameservers
}
