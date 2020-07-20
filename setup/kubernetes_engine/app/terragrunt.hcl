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

/* Inputs ------------------------------------------------------------------- */

inputs = {
  cluster_endpoint       = dependency.cluster.outputs.cluster_endpoint
  cluster_ca_certificate = dependency.cluster.outputs.cluster_ca_certificate
}
