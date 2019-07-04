output "k8s_ingress_ip" {
  value = "${google_compute_address.k8s_static_ip.address}"
}
