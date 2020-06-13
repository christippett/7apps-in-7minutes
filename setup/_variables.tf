/* ========================================================================== */
/*                                  Variables                                 */
/* ========================================================================== */

/* Project ------------------------------------------------------------------ */

variable "project_id" {
    description = "Google Cloud Project ID."
    type = string
}

variable "region" {
    description = "Default region where resources will be deployed."
    default = "us-central1"
}

/* Network ------------------------------------------------------------------ */

variable "domain_name" {
    description = "The domain name apps will be deployed under (e.g. example.com)."
    type = string
}

variable "network_name" {
    description = "Name of the VPC network set up for the demo."
    default = "vpc-7apps"
}

variable "subnetwork_name" {
    description = "Name of the VPC subnet that will be created for the demo."
    default = "vpc-subnet-01"
}

variable "firebase_nameservers" {
    description = "Firebase nameservers used to connect a custom domain."
    default = ["151.101.1.195", "151.101.65.195"]
}