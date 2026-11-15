# Workspace-aware provider configuration
# Locally, uses the AWS profile matching the workspace name (dev/prd).
# GitHub Actions sets TF_VAR_use_workspace_profile=false so the provider takes
# the OIDC credentials from the environment instead (see variables.tf).
provider "aws" {
  region  = var.aws_region
  profile = var.use_workspace_profile ? terraform.workspace : null

  default_tags {
    tags = {
      Project     = "notes-app"
      Environment = terraform.workspace
      ManagedBy   = "terraform"
    }
  }
}

# Provider for ACM certificates (must be in us-east-1 for CloudFront)
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = var.use_workspace_profile ? terraform.workspace : null

  default_tags {
    tags = {
      Project     = "notes-app"
      Environment = terraform.workspace
      ManagedBy   = "terraform"
    }
  }
}
