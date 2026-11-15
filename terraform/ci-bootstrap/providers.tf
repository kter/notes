provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  # Refuse to touch an account other than the one ENV names (e.g. the dev
  # profile with ENV=prd, or the reverse).
  allowed_account_ids = [local.account_id]

  default_tags {
    tags = {
      Project     = "notes-app"
      Environment = var.environment
      ManagedBy   = "terraform"
      Component   = "ci-bootstrap"
    }
  }
}
