# Lambda Function and API Gateway for FastAPI Backend

# Lambda function
resource "aws_lambda_function" "api" {
  function_name = "${var.project_name}-api-${terraform.workspace}"
  role          = aws_iam_role.backend.arn
  package_type  = "Image"
  image_uri     = length(regexall("@?sha256:", var.lambda_image_tag)) > 0 ? "${aws_ecr_repository.api.repository_url}@${var.lambda_image_tag}" : "${aws_ecr_repository.api.repository_url}:${var.lambda_image_tag}"
  timeout       = 60
  memory_size   = 512

  environment {
    variables = {
      COGNITO_USER_POOL_ID   = aws_cognito_user_pool.main.id
      COGNITO_APP_CLIENT_ID  = aws_cognito_user_pool_client.main.id
      COGNITO_REGION         = var.aws_region
      BEDROCK_REGION         = "us-east-1"
      BEDROCK_MODEL_ID       = "anthropic.claude-3-5-sonnet-20240620-v1:0"
      DSQL_CLUSTER_ENDPOINT  = aws_dsql_cluster.main.identifier
      CORS_ORIGINS           = jsonencode(["https://${local.current_env.domain_name}"])
      ENVIRONMENT            = terraform.workspace
      CACHE_BUCKET_NAME      = aws_s3_bucket.cache.bucket
    }
  }

  tags = {
    Name = "${var.project_name}-api-${terraform.workspace}"
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
    allow_origins     = ["https://${local.current_env.domain_name}"]
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

# Output the API URL
output "api_url" {
  description = "API URL (API Gateway)"
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "ecr_repository_url" {
  description = "ECR repository URL for API container"
  value       = aws_ecr_repository.api.repository_url
}
