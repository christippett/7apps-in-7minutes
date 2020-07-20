
/* Cloud DNS ---------------------------------------------------------------- */

resource "google_dns_managed_zone" "default" {
  project     = var.project_id
  name        = "zone-${replace(var.domain, ".", "-")}"
  description = "Public DNS zone for 7apps.servian.fun"
  dns_name    = "${var.domain}."
}

/* Domain verification ------------------------------------------------------ */

locals {
  access_token     = data.google_client_config.default.access_token
  verification_api = "https://www.googleapis.com/siteVerification/v1"
}

# STEP 1 - Initiate the verification process by requesting a token from the site
#          verification service.

# https://developers.google.com/site-verification/v1/invoking#exampleToken

data "external" "domain_verification_token" {
  program = ["bash", "-c", <<EOT
  jq -r '.data' \
  | curl --silent --show-error --fail \
      --data @- \
      --header "Content-Type: application/json" \
      --header "X-Goog-User-Project: ${var.project_id}" \
      "${local.verification_api}/token?access_token=${local.access_token}" \
  | jq -r -c
EOT
  ]

  query = {
    data = jsonencode({
      verificationMethod = "DNS_TXT",
      site = {
        identifier = var.domain
        type       = "INET_DOMAIN"
      }
    })
  }
}

# STEP 2 - Create TXT record with the contents of the verification token and
#          wait for DNS records to propagate before attempting verification

resource "google_dns_record_set" "domain_verification_txt" {
  project      = google_dns_managed_zone.default.project
  managed_zone = google_dns_managed_zone.default.name

  name    = google_dns_managed_zone.default.dns_name
  type    = "TXT"
  ttl     = 300
  rrdatas = [data.external.domain_verification_token.result.token]

  provisioner "local-exec" {
    when    = create
    command = <<EOT
    while (echo "$ns" | grep -v -q '${google_dns_managed_zone.default.name_servers[0]}'); do
      ns="$(dig @8.8.8.8 ${var.domain} SOA +short | awk '{ print $1 }')"
      echo "Waiting for DNS records to propagate..."
      echo "Current SOA record: $ns"
      sleep 10
    done
EOT
  }

  depends_on = [data.external.domain_verification_token]
}

# STEP 3 - Once the DNS records are in place, start the verification process

# https://developers.google.com/site-verification/v1/invoking#exampleInsert

resource "null_resource" "verify_domain" {
  triggers = {
    data = jsonencode({
      site = {
        type       = "INET_DOMAIN"
        identifier = trimsuffix(google_dns_managed_zone.default.dns_name, ".")
      }
    })
  }

  provisioner "local-exec" {
    when    = create
    command = <<EOT
    echo '${self.triggers.data}' \
    | curl --silent --show-error --fail \
        --data @- \
        --header "Content-Type: application/json" \
        --header "X-Goog-User-Project: ${var.project_id}" \
        "${local.verification_api}/webResource?verificationMethod=DNS_TXT&access_token=${local.access_token}"
EOT
  }

  depends_on = [google_dns_record_set.domain_verification_txt]
}
