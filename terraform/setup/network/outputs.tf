output "network_name" {
  value = google_compute_network.default.name
}

output "subnet_name" {
  value = google_compute_subnetwork.default.name
}

output "subnet_ip_range" {
  value = google_compute_subnetwork.default.ip_cidr_range
}
