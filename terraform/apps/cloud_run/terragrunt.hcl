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

dependency "dns" {
  config_path = "${local.root_dir}/setup/dns"
}

/* Inputs ------------------------------------------------------------------- */

# Unfortunately custom domains for Cloud Run aren't available (yet) in
#  Australia, so for this one service we need to deploy to an alternative
#  location.

inputs = {
  cloud_dns_zone = dependency.dns.outputs.cloud_dns_zone
}
