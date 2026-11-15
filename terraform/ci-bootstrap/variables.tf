variable "environment" {
  description = "Target environment (dev or prd). Selects the account, ECR repository and GitHub environments."
  type        = string

  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "environment must be dev or prd."
  }
}

variable "aws_profile" {
  description = "AWS profile for the provider. The Makefile passes ENV; null means credentials from the environment."
  type        = string
  default     = null
}

variable "aws_region" {
  description = "AWS region of the app resources and the Terraform state bucket"
  type        = string
  default     = "ap-northeast-1"
}

variable "github_repository" {
  description = "GitHub repository (owner/name) allowed to assume the roles"
  type        = string
  default     = "kter/notes"
}

locals {
  account_ids = {
    dev = "031921999648"
    prd = "401731371959"
  }

  account_id = local.account_ids[var.environment]

  # Must match ../backends/<env>.hcl and backends/<env>.hcl.
  state_bucket = "notes-app-terraform-state-${local.account_id}"
  lock_table   = "notes-app-terraform-locks"

  # App-side ECR repository (../lambda.tf aws_ecr_repository.api).
  ecr_repository_name = "notes-app-api-${var.environment}"

  # GitHub environments named in the OIDC `sub` claim. Their deployment branch
  # policy (main only) and required reviewers are the real gate; see
  # docs/agents/deploy.md.
  plan_github_environment   = "plan-${var.environment}"
  deploy_github_environment = "deploy-${var.environment}"
}
