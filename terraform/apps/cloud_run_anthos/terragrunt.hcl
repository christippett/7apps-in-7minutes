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

dependency "cluster" {
  config_path = "${local.root_dir}/setup/kubernetes_cluster"
}

dependency "dns" {
  config_path = "${local.root_dir}/setup/dns"
}


/* Inputs ------------------------------------------------------------------- */

inputs = {
  cluster_name           = dependency.cluster.outputs.cluster_name
  cluster_endpoint       = dependency.cluster.outputs.cluster_endpoint
  cluster_ca_certificate = dependency.cluster.outputs.cluster_ca_certificate
  cloud_dns_zone         = dependency.dns.outputs.cloud_dns_zone
}
