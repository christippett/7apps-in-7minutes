locals {
  cos_image    = "cos-cloud/cos-81-lts"
  ubuntu_image = "ubuntu-os-cloud/ubuntu-minimal-2004-lts"
}

data "google_compute_image" "ubuntu" {
  project = split("/", local.ubuntu_image)[0]
  family  = split("/", local.ubuntu_image)[1]
}

data "google_compute_image" "cos" {
  project = split("/", local.cos_image)[0]
  family  = split("/", local.cos_image)[1]
}
