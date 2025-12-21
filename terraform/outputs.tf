# Cognito outputs
output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID"
  value       = aws_cognito_user_pool_client.main.id
}

output "cognito_domain" {
  description = "Cognito domain"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

# DSQL outputs
output "dsql_endpoint" {
  description = "Aurora DSQL cluster endpoint"
  value       = aws_dsql_cluster.main.endpoint
}

# CloudFront outputs
output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.main.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "website_url" {
  description = "Website URL"
  value       = "https://${local.current_env.domain_name}"
}

# S3 outputs
output "frontend_bucket_name" {
  description = "Frontend S3 bucket name"
  value       = aws_s3_bucket.frontend.id
}

# IAM outputs
output "backend_role_arn" {
  description = "Backend IAM role ARN"
  value       = aws_iam_role.backend.arn
}

# Environment info
output "environment" {
  description = "Current environment"
  value       = terraform.workspace
}

output "enable_noindex" {
  description = "Whether noindex should be enabled"
  value       = local.current_env.enable_noindex
}
