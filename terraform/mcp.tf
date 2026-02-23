# MCP Server ECR Repository
resource "aws_ecr_repository" "mcp_server" {
  name                 = "${var.project_name}-mcp-server-${terraform.workspace}"
  image_tag_mutability = "MUTABLE"
  force_delete         = terraform.workspace != "prd"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "${var.project_name}-mcp-server-${terraform.workspace}"
    Environment = terraform.workspace
  }
}

# MCP Auth Manager ECR Repository
resource "aws_ecr_repository" "mcp_auth_manager" {
  name                 = "${var.project_name}-mcp-auth-manager-${terraform.workspace}"
  image_tag_mutability = "MUTABLE"
  force_delete         = terraform.workspace != "prd"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "${var.project_name}-mcp-auth-manager-${terraform.workspace}"
    Environment = terraform.workspace
  }
}

# IAM Policy for MCP Server to access DSQL
resource "aws_iam_role_policy" "mcp_server_dsql" {
  name = "dsql-access"
  role = aws_iam_role.backend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dsql:Connect",
          "dsql:DbConnectAdmin"
        ]
        Resource = aws_dsql_cluster.main.arn
      },
      {
        Effect = "Allow"
        Action = [
          "dsql:GenerateDbConnectAdminAuthToken"
        ]
        Resource = "*"
      }
    ]
  })
}

# MCP Server Lambda Function
resource "aws_lambda_function" "mcp_server" {
  function_name = "${var.project_name}-mcp-server-${terraform.workspace}"
  role          = aws_iam_role.backend.arn
  package_type  = "Image"
  image_uri     = length(regexall("@?sha256:", var.mcp_server_image_tag)) > 0 ? "${aws_ecr_repository.mcp_server.repository_url}@${var.mcp_server_image_tag}" : "${aws_ecr_repository.mcp_server.repository_url}:${var.mcp_server_image_tag}"
  timeout       = 900
  memory_size   = 1024

  environment {
    variables = {
      COGNITO_USER_POOL_ID   = aws_cognito_user_pool.main.id
      COGNITO_REGION         = var.aws_region
      DSQL_CLUSTER_ENDPOINT  = aws_dsql_cluster.main.identifier
      ENVIRONMENT            = terraform.workspace
      JWT_ISSUER            = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
    }
  }

  depends_on = [aws_ecr_repository.mcp_server]
}

# API Gateway for MCP Server
resource "aws_apigatewayv2_api" "mcp_server" {
  name          = "${var.project_name}-mcp-server-${terraform.workspace}"
  protocol_type = "HTTP"
  description   = "API Gateway for MCP Server"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["*"]
    allow_headers = ["*"]
  }
}

resource "aws_apigatewayv2_stage" "mcp_server" {
  api_id      = aws_apigatewayv2_api.mcp_server.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.mcp_api_gateway.arn
    format         = jsonencode({
      requestId               = "$context.requestId"
      ip                      = "$context.identity.sourceIp"
      requestTime             = "$context.requestTime"
      httpMethod              = "$context.httpMethod"
      routeKey                = "$context.routeKey"
      status                  = "$context.status"
      protocol                = "$context.protocol"
      integrationLatency      = "$context.integrationLatency"
      integrationErrorMessage = "$context.integrationErrorMessage"
    })
  }
}

resource "aws_cloudwatch_log_group" "mcp_api_gateway" {
  name              = "/aws/api-gateway/${aws_apigatewayv2_api.mcp_server.name}"
  retention_in_days = 7
}

# Default route for MCP server (catch-all)
resource "aws_apigatewayv2_route" "mcp_server_default" {
  api_id    = aws_apigatewayv2_api.mcp_server.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.mcp_server.id}"
}

# Integration with Lambda
resource "aws_apigatewayv2_integration" "mcp_server" {
  api_id                 = aws_apigatewayv2_api.mcp_server.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.mcp_server.arn
  payload_format_version = "2.0"
}

# Permission for API Gateway to invoke Lambda
resource "aws_lambda_permission" "mcp_server_api_gateway" {
  statement_id  = "AllowAPIGatewayInvokeMCP"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.mcp_server.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.mcp_server.execution_arn}/*"
}

# MCP Auth Manager Lambda Function
resource "aws_lambda_function" "mcp_auth_manager" {
  function_name = "${var.project_name}-mcp-auth-manager-${terraform.workspace}"
  role          = aws_iam_role.backend.arn
  package_type  = "Image"
  image_uri     = length(regexall("@?sha256:", var.mcp_auth_manager_image_tag)) > 0 ? "${aws_ecr_repository.mcp_auth_manager.repository_url}@${var.mcp_auth_manager_image_tag}" : "${aws_ecr_repository.mcp_auth_manager.repository_url}:${var.mcp_auth_manager_image_tag}"
  timeout       = 900
  memory_size   = 1024

  environment {
    variables = {
      COGNITO_USER_POOL_ID   = aws_cognito_user_pool.main.id
      COGNITO_APP_CLIENT_ID  = aws_cognito_user_pool_client.main.id
      COGNITO_REGION         = var.aws_region
      ENVIRONMENT            = terraform.workspace
      JWT_ISSUER            = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
    }
  }

  depends_on = [aws_ecr_repository.mcp_auth_manager]
}

# API Gateway for MCP Auth Manager
resource "aws_apigatewayv2_api" "mcp_auth_manager" {
  name          = "${var.project_name}-mcp-auth-manager-${terraform.workspace}"
  protocol_type = "HTTP"
  description   = "API Gateway for MCP Auth Manager"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["*"]
    allow_headers = ["*"]
  }
}

resource "aws_apigatewayv2_stage" "mcp_auth_manager" {
  api_id      = aws_apigatewayv2_api.mcp_auth_manager.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.mcp_auth_api_gateway.arn
    format         = jsonencode({
      requestId               = "$context.requestId"
      ip                      = "$context.identity.sourceIp"
      requestTime             = "$context.requestTime"
      httpMethod              = "$context.httpMethod"
      routeKey                = "$context.routeKey"
      status                  = "$context.status"
      protocol                = "$context.protocol"
      integrationLatency      = "$context.integrationLatency"
      integrationErrorMessage = "$context.integrationErrorMessage"
    })
  }
}

resource "aws_cloudwatch_log_group" "mcp_auth_api_gateway" {
  name              = "/aws/api-gateway/${aws_apigatewayv2_api.mcp_auth_manager.name}"
  retention_in_days = 7
}

# Default route for MCP auth manager (catch-all)
resource "aws_apigatewayv2_route" "mcp_auth_manager_default" {
  api_id    = aws_apigatewayv2_api.mcp_auth_manager.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.mcp_auth_manager.id}"
}

# Integration with Lambda
resource "aws_apigatewayv2_integration" "mcp_auth_manager" {
  api_id                 = aws_apigatewayv2_api.mcp_auth_manager.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.mcp_auth_manager.arn
  payload_format_version = "2.0"
}

# Permission for API Gateway to invoke Lambda
resource "aws_lambda_permission" "mcp_auth_manager_api_gateway" {
  statement_id  = "AllowAPIGatewayInvokeMCPAuth"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.mcp_auth_manager.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.mcp_auth_manager.execution_arn}/*"
}

# Output API Gateway URL
output "mcp_server_api_url" {
  description = "API Gateway URL for MCP Server"
  value       = aws_apigatewayv2_api.mcp_server.api_endpoint
}

output "mcp_server_ecr_repository_url" {
  description = "ECR repository URL for MCP Server"
  value       = aws_ecr_repository.mcp_server.repository_url
}

output "mcp_auth_manager_api_url" {
  description = "API Gateway URL for MCP Auth Manager"
  value       = aws_apigatewayv2_api.mcp_auth_manager.api_endpoint
}

output "mcp_auth_manager_ecr_repository_url" {
  description = "ECR repository URL for MCP Auth Manager"
  value       = aws_ecr_repository.mcp_auth_manager.repository_url
}
