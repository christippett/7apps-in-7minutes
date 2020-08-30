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

dependency "cloudbuild" {
  config_path = "${local.root_dir}/setup/cloud_build"
}

/* Inputs ------------------------------------------------------------------- */

inputs = {
  cloudbuild_trigger_id = dependency.cloudbuild.outputs.cloudbuild_trigger_id
}
