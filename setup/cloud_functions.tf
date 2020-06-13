/* ========================================================================== */
/*                               Cloud Functions                              */
/* ========================================================================== */

locals {
  function_domain = "fn.${var.domain_name}"
}


resource "google_storage_bucket_object" "function" {
  name   = "index.zip"
  bucket = google_storage_bucket.bucket.name
  source = "./path/to/zip/file/which/contains/code"
}

resource "google_cloudfunctions_function" "app" {
  name        = "function-7apps"
  description = "My function"
  runtime     = "python37"

  available_memory_mb   = 128
  source_archive_bucket = google_storage_bucket.bucket.name
  source_archive_object = google_storage_bucket_object.archive.name
  trigger_http          = true
  entry_point           = "helloGET"
}

# IAM entry for all users to invoke the function
resource "google_cloudfunctions_function_iam_member" "invoker" {
  project        = google_cloudfunctions_function.function.project
  region         = google_cloudfunctions_function.function.region
  cloud_function = google_cloudfunctions_function.function.name

  role   = "roles/cloudfunctions.invoker"
  member = "allUsers"
}

/* ========================================================================== */
/*                                     DNS                                    */
/* ========================================================================== */

# Custom domain must be set up manually through Firebase
# https://firebase.google.com/docs/hosting/custom-domain

resource "google_dns_record_set" "function" {
  name         = "${local.function_domain}."
  type         = "A"
  ttl          = 300
  managed_zone = google_dns_managed_zone.servian.name
  rrdatas      = var.firebase_nameservers
}