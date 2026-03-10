# Lambda Function and API Gateway for FastAPI Backend

locals {
  backend_lambda_environment = {
    COGNITO_USER_POOL_ID  = aws_cognito_user_pool.main.id
    COGNITO_APP_CLIENT_ID = aws_cognito_user_pool_client.main.id
    COGNITO_REGION        = var.aws_region
    BEDROCK_REGION        = "us-east-1"
    BEDROCK_MODEL_ID      = "anthropic.claude-3-5-sonnet-20240620-v1:0"
    DSQL_CLUSTER_ENDPOINT = aws_dsql_cluster.main.identifier
    CORS_ORIGINS = jsonencode([
      "https://${local.current_env.domain_name}",
      "https://${local.current_env.admin_domain_name}"
    ])
    ENVIRONMENT              = terraform.workspace
    CACHE_BUCKET_NAME        = aws_s3_bucket.cache.bucket
    MCP_SERVER_URL           = "https://${local.current_env.mcp_domain_name}"
    IMAGE_BUCKET_NAME        = aws_s3_bucket.images.bucket
    AI_EDIT_JOB_TOPIC_ARN    = aws_sns_topic.ai_edit_jobs.arn
    CDN_DOMAIN               = local.current_env.domain_name
    BOOTSTRAP_ADMIN_EMAILS   = var.bootstrap_admin_emails
    BOOTSTRAP_ADMIN_USER_IDS = var.bootstrap_admin_user_ids
  }
}

# Lambda function
resource "aws_lambda_function" "api" {
  function_name = "${var.project_name}-api-${terraform.workspace}"
  role          = aws_iam_role.backend.arn
  package_type  = "Image"
  image_uri     = length(regexall("@?sha256:", var.lambda_image_tag)) > 0 ? "${aws_ecr_repository.api.repository_url}@${var.lambda_image_tag}" : "${aws_ecr_repository.api.repository_url}:${var.lambda_image_tag}"
  timeout       = 60
  memory_size   = 512

  environment {
    variables = local.backend_lambda_environment
  }

  image_config {
    command = ["app.lambda_handler.handler"]
  }

  tags = {
    Name = "${var.project_name}-api-${terraform.workspace}"
  }

  depends_on = [aws_ecr_repository.api]
}

resource "aws_lambda_function" "ai_edit_worker" {
  function_name = "${var.project_name}-ai-edit-worker-${terraform.workspace}"
  role          = aws_iam_role.backend.arn
  package_type  = "Image"
  image_uri     = length(regexall("@?sha256:", var.lambda_image_tag)) > 0 ? "${aws_ecr_repository.api.repository_url}@${var.lambda_image_tag}" : "${aws_ecr_repository.api.repository_url}:${var.lambda_image_tag}"
  timeout       = 180
  memory_size   = 1024

  environment {
    variables = local.backend_lambda_environment
  }

  image_config {
    command = ["app.worker_lambda_handler.handler"]
  }

  tags = {
    Name = "${var.project_name}-ai-edit-worker-${terraform.workspace}"
  }

  depends_on = [aws_ecr_repository.api]
}

# ECR Repository for Lambda container image
resource "aws_ecr_repository" "api" {
  name                 = "${var.project_name}-api-${terraform.workspace}"
  image_tag_mutability = "MUTABLE"
  force_delete         = terraform.workspace != "prd"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${var.project_name}-api-${terraform.workspace}"
  }
}

# API Gateway HTTP API
resource "aws_apigatewayv2_api" "api" {
  name          = "${var.project_name}-api-${terraform.workspace}"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = [
      "https://${local.current_env.domain_name}",
      "https://${local.current_env.admin_domain_name}"
    ]
    allow_methods     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers     = ["Authorization", "Content-Type"]
    allow_credentials = true
    max_age           = 86400
  }

  tags = {
    Name = "${var.project_name}-api-${terraform.workspace}"
  }
}

# API Gateway Lambda Integration
resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

# API Gateway Default Route (catch-all)
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# API Gateway Default Stage with auto-deploy
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  tags = {
    Name = "${var.project_name}-api-${terraform.workspace}"
  }
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*"
}

# ACM certificate for the API custom domain
resource "aws_acm_certificate" "api" {
  domain_name       = local.current_env.api_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# DNS validation record for the API certificate
resource "aws_route53_record" "api_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main.zone_id
}

# Wait until the API certificate is validated before binding the custom domain
resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for record in aws_route53_record.api_cert_validation : record.fqdn]
}

# Custom domain name for the main API Gateway HTTP API
resource "aws_apigatewayv2_domain_name" "api" {
  domain_name = local.current_env.api_domain_name

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.api.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

# Map the custom domain to the API's default stage
resource "aws_apigatewayv2_api_mapping" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  domain_name = aws_apigatewayv2_domain_name.api.id
  stage       = aws_apigatewayv2_stage.default.id
}

# Route53 alias from the API subdomain to API Gateway
resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = local.current_env.api_domain_name
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# Output the API URL
output "api_url" {
  description = "API URL (custom domain)"
  value       = "https://${local.current_env.api_domain_name}"
}

output "ecr_repository_url" {
  description = "ECR repository URL for API container"
  value       = aws_ecr_repository.api.repository_url
}
