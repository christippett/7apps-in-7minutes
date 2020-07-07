locals {
  service_urls = {
    CLOUD_RUN_URL          = "https://${var.service.cloud_run.subdomain}.${var.domain}"
    CLOUD_RUN_ANTHOS_URL   = "https://${var.service.cloud_run_anthos.subdomain}.${var.domain}"
    CLOUD_FUNCTIONS_URL    = "https://${var.service.cloud_functions.subdomain}.${var.domain}"
    APPENGINE_STANDARD_URL = "https://${var.service.appengine_standard.subdomain}.${var.domain}"
    APPENGINE_FLEXIBLE_URL = "https://${var.service.appengine_flexible.subdomain}.${var.domain}"
    COMPUTE_ENGINE_URL     = "https://${var.service.compute_engine.subdomain}.${var.domain}"
    KUBERNETES_ENGINE_URL  = "https://${var.service.kubernetes_engine.subdomain}.${var.domain}"
  }
}
