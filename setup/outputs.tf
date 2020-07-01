/* ========================================================================== */
/*                                   Outputs                                  */
/* ========================================================================== */

/* DNS ---------------------------------------------------------------------- */

output "app_dns_records" {
  value = {
    (var.domain_name) = {
      NS   = google_dns_managed_zone.dns.name_servers
      A    = [for rec in google_app_engine_domain_mapping.default.resource_records : rec.rrdata if rec.type == "A"]
      AAAA = [for rec in google_app_engine_domain_mapping.default.resource_records : rec.rrdata if rec.type == "AAAA"]
    }
    (google_cloud_run_domain_mapping.managed.name) = {
      CNAME = flatten([
        for _rec in google_cloud_run_domain_mapping.managed.status.*.resource_records : [
          for rec in _rec : rec.rrdata if rec.type == "CNAME"
        ]
      ])[0]
    }
    (google_cloud_run_domain_mapping.anthos.name) = {
      CNAME = flatten([
        for _rec in google_cloud_run_domain_mapping.anthos.status.*.resource_records : [
          for rec in _rec : rec.rrdata if rec.type == "CNAME"
        ]
      ])[0]
    }
    # (google_cloud_run_domain_mapping.managed.name) = google_cloud_run_domain_mapping.managed.status.*.resource_records
    # (google_cloud_run_domain_mapping.anthos.name)  = google_cloud_run_domain_mapping.managed.status.*.resource_records
    (google_app_engine_domain_mapping.standard.domain_name) = {
      for rec in google_app_engine_domain_mapping.standard.resource_records : rec.type => rec.rrdata
    }
    (google_app_engine_domain_mapping.flexible.domain_name) = {
      for rec in google_app_engine_domain_mapping.flexible.resource_records : rec.type => rec.rrdata
    }
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
