variable "project_id" { type = string }

variable "service" { type = string }

variable "description" { type = string }

variable "domain" { type = string }

variable "network_name" { type = string }

variable "subnet_name" { type = string }

variable "image_name" { type = string }

variable "cloud_dns_zone" { type = string }

variable "google_cname" {
  type    = string
  default = "ghs.googlehosted.com."
}
