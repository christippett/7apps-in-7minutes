terraform {
  backend "remote" {
    hostname     = "app.terraform.io"
    organization = "servian-melbourne"

    workspaces {
      name = "7apps7minutes"
    }
  }
}
