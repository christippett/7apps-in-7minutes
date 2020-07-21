include {
  path = find_in_parent_folders()
}

/* Locals ------------------------------------------------------------------- */

locals {
  root_dir = get_parent_terragrunt_dir()
}

/* Dependencies ------------------------------------------------------------- */

dependencies {
  paths = ["${local.root_dir}/setup/project"]
}

dependency "dns" {
  config_path = "${local.root_dir}/setup/dns"
}

/* Inputs ------------------------------------------------------------------- */

inputs = {
  cloud_dns_zone = dependency.dns.outputs.cloud_dns_zone
}
