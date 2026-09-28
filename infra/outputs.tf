output "tool_urls" {
  description = "Front-end URL per tool, for the preview link posted on a pull request."
  value       = { for name, tool in module.tools : name => tool.web_url }
}

output "database_url" {
  description = "Connection string for migrations in this environment."
  value       = "postgres://${var.db_user}:${var.db_password}@localhost:${var.db_port}/${var.db_name}"
  sensitive   = true
}
