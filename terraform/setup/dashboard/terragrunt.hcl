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
    "${local.root_dir}/setup/project",
    "${local.root_dir}/setup/kubernetes_cluster",
    "${local.root_dir}/apps/cloud_run",
    "${local.root_dir}/apps/cloud_run_anthos",
    "${local.root_dir}/apps/cloud_functions",
    "${local.root_dir}/apps/app_engine",
    "${local.root_dir}/apps/compute_engine",
    "${local.root_dir}/apps/kubernetes",
  ]
}

dependency "cloud_build" {
  config_path = "${local.root_dir}/setup/cloud_build"
}

/* Inputs ------------------------------------------------------------------- */

inputs = {
  app_dir                = "${local.root_dir}/dashboard"
  cloud_build_trigger_id = dependency.cloud_build.outputs.cloud_build_trigger_id
  cloud_build_topic      = dependency.cloud_build.outputs.cloud_build_topic
}
