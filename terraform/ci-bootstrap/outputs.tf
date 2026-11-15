# Set these as the AWS_ROLE_ARN environment variable of the matching GitHub
# environment (plan-<env> / deploy-<env>). See docs/agents/deploy.md.
output "plan_role_arn" {
  description = "AWS_ROLE_ARN for the plan-<env> GitHub environment"
  value       = aws_iam_role.plan.arn
}

output "deploy_role_arn" {
  description = "AWS_ROLE_ARN for the deploy-<env> GitHub environment"
  value       = aws_iam_role.deploy.arn
}

output "github_environments" {
  description = "GitHub environment names these roles trust"
  value = {
    plan   = local.plan_github_environment
    deploy = local.deploy_github_environment
  }
}

output "app_boundary_arn" {
  description = "Permissions boundary that every notes-app-* role must carry (terraform/main.tf local.app_role_boundary_arn)"
  value       = aws_iam_policy.app_boundary.arn
}
