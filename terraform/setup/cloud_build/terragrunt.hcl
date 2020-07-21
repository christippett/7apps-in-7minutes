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

dependency "cluster" {
  config_path = "${local.root_dir}/setup/kubernetes_cluster"
}

/* Inputs ------------------------------------------------------------------- */

inputs = {
  kubernetes_cluster_name = dependency.cluster.outputs.cluster_name
}
