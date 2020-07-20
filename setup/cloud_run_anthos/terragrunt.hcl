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
    "${local.root_dir}/cloud_build",
    "${local.root_dir}/project"
  ]
}

dependency "cluster" {
  config_path = "${local.root_dir}/kubernetes_engine/cluster"
}

dependency "dns" {
  config_path = "${local.root_dir}/dns"
}


/* Inputs ------------------------------------------------------------------- */

inputs = {
  cluster_name     = dependency.cluster.outputs.cluster_name
  cluster_endpoint = dependency.cluster.outputs.cluster_endpoint
  cloud_dns_zone   = dependency.dns.outputs.cloud_dns_zone
}
