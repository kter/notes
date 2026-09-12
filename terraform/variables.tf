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
    }
    prd = {
      domain_name       = "notes.devtools.site"
      api_domain_name   = "api.notes.devtools.site"
      admin_domain_name = "admin.notes.devtools.site"
      hosted_zone_name  = "devtools.site"
      enable_noindex    = false
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

# Lambda image tag. Deliberately has no default: the digest that is actually
# deployed lives only in Terraform state, so a default of "latest" would make
# every apply that omits -var revert image_uri from the pinned digest back to a
# mutable tag. Required means an apply without a digest fails instead.
# The Makefile resolves it from ECR via $(TF_VAR_IMAGE).
variable "lambda_image_tag" {
  description = "Docker image tag or sha256 digest for the Lambda image (required; see Makefile TF_VAR_IMAGE)"
  type        = string
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

variable "ses_email_identity_arn" {
  description = "ARN of the SES verified email identity for Cognito user pool emails"
  type        = string
  default     = ""
}

variable "cognito_from_email" {
  description = "From email address for Cognito user pool emails (must be verified in SES)"
  type        = string
  default     = ""
}

variable "sentry_traces_sample_rate" {
  description = "Optional backend Sentry trace sample rate override"
  type        = number
  default     = null
}
