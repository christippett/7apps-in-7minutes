include {
  path = find_in_parent_folders()
}

/* Locals ------------------------------------------------------------------- */

locals {
  root_dir = get_parent_terragrunt_dir()
}

/* Dependencies ------------------------------------------------------------- */

dependencies {
  paths = ["${local.root_dir}/project"]
}

dependency "project" {
  config_path = "${local.root_dir}/network"
}

dependency "dns" {
  config_path = "${local.root_dir}/dns"
}

/* Inputs ------------------------------------------------------------------- */

inputs = {
  cloud_dns_zone = dependency.dns.outputs.cloud_dns_zone
}
