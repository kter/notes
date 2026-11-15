terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  # Created by terraform/ci-bootstrap (apply it first). Every notes-app-* role
  # carries it: the CI deploy role can only create roles with this boundary.
  app_role_boundary_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/notes-boundary-app-roles"
}
