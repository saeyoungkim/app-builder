# One tool: an API container and a web container, wired to the shared database
# and the shared identity provider. No tool gets to invent its own topology.

terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

resource "docker_image" "api" {
  name = "paved/${var.tool_id}-api:${var.image_tag}"

  build {
    context    = "${path.root}/.."
    dockerfile = "ops/Dockerfile.api"
    build_args = { TOOL = var.tool_id }
  }
}

resource "docker_image" "web" {
  name = "paved/${var.tool_id}-web:${var.image_tag}"

  build {
    context    = "${path.root}/.."
    dockerfile = "ops/Dockerfile.web"
    build_args = { TOOL = var.tool_id }
  }
}

resource "docker_container" "api" {
  name    = "paved-${var.environment}-${var.tool_id}-api"
  image   = docker_image.api.image_id
  restart = "unless-stopped"

  env = [
    "NODE_ENV=production",
    "PORT=${var.api_port}",
    "DATABASE_URL=${var.database_url}",
    "IDP_ISSUER=${var.idp_issuer}",
    "SESSION_SECRET=${var.session_secret}",
    "AUDIT_SINK=postgres",
  ]

  networks_advanced {
    name = var.network_name
  }

  ports {
    internal = var.api_port
    external = var.api_port
  }
}

resource "docker_container" "web" {
  name    = "paved-${var.environment}-${var.tool_id}-web"
  image   = docker_image.web.image_id
  restart = "unless-stopped"

  env = [
    "NODE_ENV=production",
    "PORT=${var.web_port}",
    "NEXT_PUBLIC_API_URL=http://localhost:${var.api_port}",
  ]

  networks_advanced {
    name = var.network_name
  }

  ports {
    internal = var.web_port
    external = var.web_port
  }
}
