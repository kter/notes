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
