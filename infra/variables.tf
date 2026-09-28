variable "environment" {
  description = "Environment name. Preview environments are disposable and named after the PR."
  type        = string
  default     = "dev"
}

variable "db_user" {
  type    = string
  default = "devuser"
}

variable "db_password" {
  type      = string
  default   = "devpass"
  sensitive = true
}

variable "db_name" {
  type    = string
  default = "paved"
}

variable "db_port" {
  type    = number
  default = 5432
}

variable "idp_issuer" {
  description = "OIDC issuer. Local provider in dev; the corporate IdP everywhere else."
  type        = string
  default     = "http://localhost:9000"
}

variable "tools" {
  description = "Every tool on the paved road. Adding a tool is adding a map entry."
  type = map(object({
    api_port = number
    web_port = number
  }))
  default = {
    customer-console = {
      api_port = 4001
      web_port = 3001
    }
    kyc-queue = {
      api_port = 4002
      web_port = 3002
    }
    dsar-console = {
      api_port = 4003
      web_port = 3003
    }
  }
}
