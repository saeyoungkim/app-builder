variable "environment" { type = string }
variable "tool_id" { type = string }
variable "api_port" { type = number }
variable "web_port" { type = number }
variable "network_name" { type = string }
variable "database_url" {
  type      = string
  sensitive = true
}
variable "idp_issuer" { type = string }
variable "session_secret" {
  type      = string
  sensitive = true
}
variable "image_tag" {
  type    = string
  default = "latest"
}
