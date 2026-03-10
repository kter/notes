variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-northeast-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "notes-app"
}

# Environment-specific configurations
locals {
  env_config = {
    dev = {
      domain_name       = "notes.dev.devtools.site"
      api_domain_name   = "api.notes.dev.devtools.site"
      admin_domain_name = "admin.notes.dev.devtools.site"
      hosted_zone_name  = "dev.devtools.site"
      enable_noindex    = true
      mcp_domain_name   = "mcp.notes.dev.devtools.site"
    }
    prd = {
      domain_name       = "notes.devtools.site"
      api_domain_name   = "api.notes.devtools.site"
      admin_domain_name = "admin.notes.devtools.site"
      hosted_zone_name  = "devtools.site"
      enable_noindex    = false
      mcp_domain_name   = "mcp.notes.devtools.site"
    }
  }

  current_env = local.env_config[terraform.workspace]
}

variable "cognito_callback_urls" {
  description = "Additional Cognito callback URLs (for local development)"
  type        = list(string)
  default     = []
}

variable "cognito_logout_urls" {
  description = "Additional Cognito logout URLs (for local development)"
  type        = list(string)
  default     = []
}

# Lambda image tag (use digest for production deployments)
variable "lambda_image_tag" {
  description = "Docker image tag for Lambda function (e.g., 'latest' or sha256 digest)"
  type        = string
  default     = "latest"
}

# MCP Server Lambda image tag
variable "mcp_server_image_tag" {
  description = "Docker image tag for MCP Server Lambda function (e.g., 'latest' or sha256 digest)"
  type        = string
  default     = "latest"
}

# MCP Auth Manager Lambda image tag
variable "mcp_auth_manager_image_tag" {
  description = "Docker image tag for MCP Auth Manager Lambda function (e.g., 'latest' or sha256 digest)"
  type        = string
  default     = "latest"
}

variable "bootstrap_admin_emails" {
  description = "Comma-separated list of emails to bootstrap as admin users"
  type        = string
  default     = ""
}

variable "bootstrap_admin_user_ids" {
  description = "Comma-separated list of user IDs to bootstrap as admin users"
  type        = string
  default     = ""
}
