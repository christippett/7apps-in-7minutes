variable "cloud_dns_zone" { type = string }

variable "firebase_dns" {
  type = list
  default = [
    "151.101.1.195",
    "151.101.65.195"
  ]
}
