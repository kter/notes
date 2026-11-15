# IAM roles that let the GitHub Actions deploy workflow (.github/workflows/deploy.yml)
# reach AWS through OIDC. The owner applies this root locally, once per account:
#   make ci-bootstrap-plan ENV=dev && make ci-bootstrap-apply ENV=dev
# CI never applies it: the deploy role is denied any change to these roles.
#
# Uses the default workspace. The account is chosen by ENV through the backend
# config (backends/<env>.hcl) and checked by allowed_account_ids in providers.tf.
terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Configured with -backend-config=backends/<env>.hcl (see Makefile ci-bootstrap-*).
  backend "s3" {}
}
