/* ========================================================================== */
/*                                   Outputs                                  */
/* ========================================================================== */

/* DNS ---------------------------------------------------------------------- */

output "dns_nameservers" {
  value = google_dns_managed_zone.dns.name_servers
}

output "app_nameservers" {
  value = {
    cloud_run_managed  = google_cloud_run_domain_mapping.managed.status[0].resource_records
    cloud_run_anthos   = google_cloud_run_domain_mapping.anthos.status[0].resource_records
    appengine_standard = google_app_engine_domain_mapping.standard.resource_records
    appengine_flexible = google_app_engine_domain_mapping.flexible.resource_records
  }
}


/* Cloud SQL ---------------------------------------------------------------- */

output "db_connection_parameters" {
  value = {
    host = [
      module.cloudsql.private_ip_address,
      module.cloudsql.public_ip_address
    ]
    port        = "5432"
    user        = local.db_user
    password    = local.db_password
    public_url  = "postgres://${local.db_user}:${local.db_password}@${module.cloudsql.public_ip_address}:5432/${local.db_name}"
    private_url = "postgres://${local.db_user}:${local.db_password}@${module.cloudsql.private_ip_address}:5432/${local.db_name}"
  }
}
