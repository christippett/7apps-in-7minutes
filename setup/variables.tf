/* ========================================================================== */
/*                                  Variables                                 */
/* ========================================================================== */

/* Project ------------------------------------------------------------------ */

variable "project_id" {
  description = "Google Cloud Project ID."
  type        = string
}

variable "region" {
  description = "Default region where resources will be deployed."
  default     = "us-central1"
}

variable "email" {
  description = "Email address used by Let's Encrypt to generate SSL/TLS certificates"
  type        = string
}

/* Database ----------------------------------------------------------------- */

variable "database_user" {
  description = "The name of the application user account set up on Cloud SQL."
  default     = "7apps"
}

variable "database_password" {
  description = "The password for the application user account set up on Cloud SQL. If null, a password will be automatically generated."
  default     = null
}

/* Domains ------------------------------------------------------------------ */

variable "domain_name" {
  description = "The domain name all applications will be deployed under (e.g. example.com)."
  type        = string
}

variable "appengine_standard_subdomain" {
  default = "appengine"
}

variable "appengine_flexible_subdomain" {
  default = "appengine-flex"
}

variable "compute_engine_subdomain" {
  default = "compute"
}

variable "function_subdomain" {
  default = "function"
}

variable "cloud_run_managed_subdomain" {
  default = "run"
}

variable "cloud_run_anthos_subdomain" {
  default = "anthos-run"
}

variable "kubernetes_engine_subdomain" {
  default = "gke"
}

/* Network ------------------------------------------------------------------ */

variable "network_name" {
  description = "Name of the VPC network set up for the demo."
  default     = "se7en-apps-vpc"
}

variable "firebase_nameservers" {
  description = "Firebase nameservers used to connect a custom domain."
  default     = ["151.101.1.195", "151.101.65.195"]
}

/* Application -------------------------------------------------------------- */

variable "container_image" {
  description = "The initial container image used for initial deployment."
  default     = "gcr.io/google-samples/hello-app:1.0"
}
