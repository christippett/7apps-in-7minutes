include {
  path = find_in_parent_folders()
}

/* Locals ------------------------------------------------------------------- */

locals {
  root_dir = get_parent_terragrunt_dir()
}

/* Dependencies ------------------------------------------------------------- */

dependencies {
  paths = [
    "${local.root_dir}/setup/cloud_build",
    "${local.root_dir}/setup/project"
  ]
}

dependency "network" {
  config_path = "${local.root_dir}/setup/network"
}

dependency "dns" {
  config_path = "${local.root_dir}/setup/dns"
}

dependency "cloud_build" {
  config_path = "${local.root_dir}/setup/cloud_build"
}

/* Inputs ------------------------------------------------------------------- */

inputs = {
  cloud_dns_zone                  = dependency.dns.outputs.cloud_dns_zone
  network_name                    = dependency.network.outputs.network_name
  subnet_name                     = dependency.network.outputs.subnet_name
  cloud_scheduler_service_account = dependency.cloud_build.outputs.cloud_scheduler_service_account.email
}
