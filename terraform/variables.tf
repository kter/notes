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
      domain_name      = "notes.dev.devtools.site"
      hosted_zone_name = "dev.devtools.site"
      enable_noindex   = true
    }
    prd = {
      domain_name      = "notes.devtools.site"
      hosted_zone_name = "devtools.site"
      enable_noindex   = false
    }
  }

  current_env = local.env_config[terraform.workspace]
}

# Cognito settings
variable "cognito_callback_urls" {
  description = "Cognito callback URLs"
  type        = list(string)
  default     = ["http://localhost:3000/auth/callback"]
}

variable "cognito_logout_urls" {
  description = "Cognito logout URLs"
  type        = list(string)
  default     = ["http://localhost:3000"]
}
