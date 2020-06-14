/* ========================================================================== */
/*                                 App Engine                                 */
/* ========================================================================== */

locals {
  appengine_flexible_domain = "flexible.gae.${var.domain_name}"
  appengine_standard_domain = "standard.gae.${var.domain_name}"
}

/* App Engine Flexible ------------------------------------------------------ */

resource "google_app_engine_flexible_app_version" "app" {
  project = var.project_id
  service = "flexible"
  runtime = "custom"
  version = "v1"

  instance_class = "F1"

  deployment {
    container {
      image = "gcr.io/cloudrun/hello"
    }
  }

  liveness_check {
    path = "/"
  }

  readiness_check {
    path = "/"
  }

  automatic_scaling {
    min_total_instances = 2
    max_total_instances = 5
    cool_down_period = "120s"
    cpu_utilization {
      target_utilization = 0.5
    }
    request_utilization {
      target_request_count_per_second = 20
      target_concurrent_requests = 10
    }
  }

  network {
    name = module.vpc.network_name
    subnetwork = var.subnetwork_name
    instance_tag = "appengine"
  }

  vpc_access_connector {
    name = google_vpc_access_connector.connector.id
  }

  delete_service_on_destroy = true
}

/* App Engine Standard ------------------------------------------------------ */

resource "google_storage_bucket_object" "appengine" {
  name   = "hello-world.zip"
  bucket = google_storage_bucket.bucket.name
  source = "./test-fixtures/appengine/hello-world.zip"
}

resource "google_app_engine_standard_app_version" "app" {
  project    = var.project_id
  service    = "standard"
  runtime    = "python37"
  version_id = "v1"

  instance_class = "F1"

  deployment {
    zip {
      source_url = google_storage_bucket_object.source_code.self_link
    }
  }

  basic_scaling {
    max_instances = 5
    idle_timeout = 300
  }

  # automatic_scaling {
  #   max_concurrent_requests = 10
  #   standard_scheduler_settings {
  #     target_cpu_utilization = 0.5
  #     target_throughput_utilization = 0.75
  #     min_instances = 2
  #     max_instances = 5
  #   }
  # }

  delete_service_on_destroy = true
}


/* Routing Rules ------------------------------------------------------------ */

# https://cloud.google.com/appengine/docs/standard/python/reference/dispatch-yaml

resource "google_app_engine_application_url_dispatch_rules" "app" {
  dispatch_rules {
    domain  = local.appengine_standard_domain
    path    = "/*"
    service = "standard"
  }

  dispatch_rules {
    domain  = local.appengine_flexible_domain
    path    = "/*"
    service = "flexible"
  }
}
