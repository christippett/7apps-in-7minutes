/* ========================================================================== */
/*                                   Outputs                                  */
/* ========================================================================== */

/* DNS ---------------------------------------------------------------------- */

output "dns_nameservers" {
  value = google_dns_managed_zone.dns.name_servers
}

/* Cloud SQL ---------------------------------------------------------------- */

output "db_connection_parameters" {
  value = {
    host = [
      module.cloudsql.private_ip_address,
      module.cloudsql.public_ip_address
    ]
    port     = "5432"
    user     = local.db_user
    password = local.db_password
    public_url = "postgres://${local.db_user}:${local.db_password}@${module.cloudsql.public_ip_address}:5432/${local.db_name}"
    private_url = "postgres://${local.db_user}:${local.db_password}@${module.cloudsql.private_ip_address}:5432/${local.db_name}"
  }
}
