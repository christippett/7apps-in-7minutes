/* ========================================================================== */
/*                                  Cloud Run                                 */
/* ========================================================================== */

locals {
  cloudrun_anthos_domain = "run.gke.${var.domain_name}"
}

/* Cloud Run (Anthos) ------------------------------------------------------- */

# https://cloud.google.com/run/docs/gke/setup

# TODO

/* DNS ---------------------------------------------------------------------- */

resource "google_dns_record_set" "cloudrun_anthos" {
  name         = "${local.cloudrun_managed_domain}."
  type         = "A"
  ttl          = 300
  managed_zone = google_dns_managed_zone.servian.name
  rrdatas      = [null]
}
