resource "google_dns_managed_zone" "servian_dot_fun" {
  name     = "servian-dot-fun"
  dns_name = "servian.fun."
}

resource "google_dns_managed_zone" "gke_dot_servian_dot_fun" {
  name     = "gke-dot-servian-dot-fun"
  dns_name = "gke.servian.fun."
}

resource "google_dns_record_set" "gke_name_servers" {
  name         = "gke.${google_dns_managed_zone.servian_dot_fun.dns_name}"
  type         = "NS"
  ttl          = 86400
  managed_zone = "${google_dns_managed_zone.servian_dot_fun.name}"
  rrdatas      = ["${google_dns_managed_zone.gke_dot_servian_dot_fun.name_servers}"]
}

resource "google_dns_record_set" "demo_instance" {
  name         = "gce.${google_dns_managed_zone.servian_dot_fun.dns_name}"
  type         = "A"
  ttl          = 300
  managed_zone = "${google_dns_managed_zone.servian_dot_fun.name}"
  rrdatas      = ["${google_compute_instance.demo_instance.network_interface.0.access_config.0.nat_ip}"]
}

resource "google_dns_record_set" "cloud_run" {
  name         = "run.${google_dns_managed_zone.servian_dot_fun.dns_name}"
  type         = "CNAME"
  ttl          = 300
  managed_zone = "${google_dns_managed_zone.servian_dot_fun.name}"
  rrdatas      = ["ghs.googlehosted.com."]
}

resource "google_dns_record_set" "appengine_standard" {
  name         = "appengine-standard.${google_dns_managed_zone.servian_dot_fun.dns_name}"
  type         = "CNAME"
  ttl          = 300
  managed_zone = "${google_dns_managed_zone.servian_dot_fun.name}"
  rrdatas      = ["ghs.googlehosted.com."]
}

resource "google_dns_record_set" "appengine_flexible" {
  name         = "appengine-flex.${google_dns_managed_zone.servian_dot_fun.dns_name}"
  type         = "CNAME"
  ttl          = 300
  managed_zone = "${google_dns_managed_zone.servian_dot_fun.name}"
  rrdatas      = ["ghs.googlehosted.com."]
}

resource "google_dns_record_set" "servian_www" {
  name         = "www.${google_dns_managed_zone.servian_dot_fun.dns_name}"
  type         = "CNAME"
  ttl          = 300
  managed_zone = "${google_dns_managed_zone.servian_dot_fun.name}"
  rrdatas      = ["ghs.googlehosted.com."]
}

resource "google_dns_record_set" "servian_naked" {
  name         = "${google_dns_managed_zone.servian_dot_fun.dns_name}"
  type         = "A"
  ttl          = 300
  managed_zone = "${google_dns_managed_zone.servian_dot_fun.name}"
  rrdatas      = ["216.239.32.21", "216.239.34.21", "216.239.36.21", "216.239.38.21"]
}

resource "google_dns_record_set" "servian_naked_ipv6" {
  name         = "${google_dns_managed_zone.servian_dot_fun.dns_name}"
  type         = "AAAA"
  ttl          = 300
  managed_zone = "${google_dns_managed_zone.servian_dot_fun.name}"
  rrdatas      = ["2001:4860:4802:32::15", "2001:4860:4802:34::15", "2001:4860:4802:36::15", "2001:4860:4802:38::15"]
}

resource "google_dns_record_set" "servian_verification" {
  name         = "${google_dns_managed_zone.servian_dot_fun.dns_name}"
  type         = "TXT"
  ttl          = 300
  managed_zone = "${google_dns_managed_zone.servian_dot_fun.name}"
  rrdatas      = ["google-site-verification=uJRrxBNbIkWFFdZOSIrmXohBQPbdMBa49YuA-2GUEhU"]
}

resource "google_dns_record_set" "cloud_run_gke" {
  name         = "run-gke.${google_dns_managed_zone.servian_dot_fun.dns_name}"
  type         = "A"
  ttl          = 300
  managed_zone = "${google_dns_managed_zone.servian_dot_fun.name}"
  rrdatas      = ["35.189.18.208"]
}
