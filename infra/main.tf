# Infrastructure for one internal tool, defined once and reused.
#
# Every tool on the paved road is the same shape: a container image for the API,
# a container image for the web front end, a database schema, and a secret. A new
# tool is a new module block, not a new architecture. Applied per environment
# (preview / staging / production) with the same code and different variables.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "docker" {}

resource "random_password" "session_secret" {
  length  = 48
  special = false
}

resource "docker_network" "paved" {
  name = "paved-${var.environment}"
}

resource "docker_image" "postgres" {
  name         = "postgres:16"
  keep_locally = true
}

resource "docker_container" "postgres" {
  name  = "paved-${var.environment}-db"
  image = docker_image.postgres.image_id

  env = [
    "POSTGRES_USER=${var.db_user}",
    "POSTGRES_PASSWORD=${var.db_password}",
    "POSTGRES_DB=${var.db_name}",
  ]

  networks_advanced {
    name = docker_network.paved.name
  }

  ports {
    internal = 5432
    external = var.db_port
  }

  healthcheck {
    test     = ["CMD-SHELL", "pg_isready -U ${var.db_user}"]
    interval = "5s"
    retries  = 10
  }
}

# The identity provider is a platform service, not a per-tool concern. In a real
# environment this block is replaced by the corporate IdP and nothing else changes:
# tools keep talking OIDC to whatever `idp_issuer` points at.
module "tools" {
  source   = "./modules/tool"
  for_each = var.tools

  environment    = var.environment
  tool_id        = each.key
  api_port       = each.value.api_port
  web_port       = each.value.web_port
  network_name   = docker_network.paved.name
  database_url   = "postgres://${var.db_user}:${var.db_password}@${docker_container.postgres.name}:5432/${var.db_name}"
  idp_issuer     = var.idp_issuer
  session_secret = random_password.session_secret.result
}
