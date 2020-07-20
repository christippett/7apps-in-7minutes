variable "network_name" { type = string }

variable "subnet_name" { type = string }

variable "cloud_dns_zone" { type = string }

variable "google_dns" {
  type    = string
  default = "ghs.googlehosted.com."
}
