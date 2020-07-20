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
    "${local.root_dir}/project",
    "${local.root_dir}/cloud_run",
    "${local.root_dir}/cloud_run_anthos",
    "${local.root_dir}/cloud_functions",
    "${local.root_dir}/app_engine_standard",
    "${local.root_dir}/app_engine_flexible",
    "${local.root_dir}/compute_engine",
    "${local.root_dir}/kubernetes_engine/cluster"
  ]
}

dependency "dns" {
  config_path = "${local.root_dir}/dns"
}

/* Inputs ------------------------------------------------------------------- */

inputs = {
  cloud_dns_zone = dependency.dns.outputs.cloud_dns_zone
}
