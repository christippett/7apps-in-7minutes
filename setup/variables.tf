/* Project ------------------------------------------------------------------ */

variable "project_id" {
  description = "Google Cloud Project ID."
  type        = string
}

variable "region" {
  description = "Default region where resources will be deployed."
  default     = "us-central1"
}

variable "network_name" {
  description = "Name of the VPC network set up for the demo."
  default     = "se7en-apps-vpc"
}

variable "name_prefix" {
  description = "The value to prefix all resources with."
  type        = string
  default     = ""
}

/* Application -------------------------------------------------------------- */

variable "service" {
  description = "The name given to each service."
  type        = map
  default = {
    cloud_run = {
      name        = "run-7apps"
      description = "Cloud Run"
      subdomain   = "run"
    }
    cloud_run_anthos = {
      name        = "anthos-7apps"
      description = "Cloud Run: Anthos"
      subdomain   = "run-anthos"
    }
    cloud_functions = {
      name        = "function-7apps"
      description = "Cloud Functions"
      subdomain   = "function"
    }
    appengine_standard = {
      name        = "standard"
      description = "App Engine: Standard"
      subdomain   = "appengine-standard"
    }
    appengine_flexible = {
      name        = "flexible"
      description = "App Engine: Flexible"
      subdomain   = "appengine-flexible"
    }
    compute_engine = {
      name        = "vm-7apps"
      description = "Compute Engine"
      subdomain   = "compute"
    }
    kubernetes_engine = {
      name        = "gke-7apps"
      description = "Kubernetes Engine"
      subdomain   = "gke"
    }
  }
}

variable "domain" {
  description = "The domain name applications will be deployed under (e.g. example.com)."
  type        = string
}

variable "email" {
  description = "Email address used by Let's Encrypt to generate SSL/TLS certificates"
  type        = string
}


variable "container_image_name" {
  description = "The name of the container image used to build and deploy."
  default     = "7apps-app"
}

/* Misc --------------------------------------------------------------------- */

variable "firebase_nameservers" {
  description = "Firebase nameservers used to connect a custom domain."
  type        = list
  default     = ["151.101.1.195", "151.101.65.195"]
}

variable "google_cname" {
  description = "Default CNAME record value when managing domains through Google"
  type        = string
  default     = "ghs.googlehosted.com."
}
