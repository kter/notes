# ============================================================================
# MCP API Key Support
# ============================================================================

# ============================================================================
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
      DSQL_CLUSTER_ENDPOINT = aws_dsql_cluster.main.identifier
      ENVIRONMENT           = terraform.workspace
    }
  }

  depends_on = [aws_ecr_repository.mcp_server]
}

# CloudWatch Log Group for MCP Server Lambda
resource "aws_cloudwatch_log_group" "mcp_server_lambda" {
  name              = "/aws/lambda/${aws_lambda_function.mcp_server.function_name}"
  retention_in_days = 90
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
    format = jsonencode({
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
  retention_in_days = 90
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

# ACM 証明書（API Gateway は ap-northeast-1 に作成）
resource "aws_acm_certificate" "mcp_server" {
  domain_name       = local.current_env.mcp_domain_name
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

# ACM DNS 検証レコード
resource "aws_route53_record" "mcp_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.mcp_server.domain_validation_options : dvo.domain_name => {
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

# ACM 証明書の検証完了を待機
resource "aws_acm_certificate_validation" "mcp_server" {
  certificate_arn         = aws_acm_certificate.mcp_server.arn
  validation_record_fqdns = [for record in aws_route53_record.mcp_cert_validation : record.fqdn]
}

# API Gateway v2 カスタムドメイン名
resource "aws_apigatewayv2_domain_name" "mcp_server" {
  domain_name = local.current_env.mcp_domain_name
  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.mcp_server.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

# API マッピング（カスタムドメインを API Gateway ステージに紐付け）
resource "aws_apigatewayv2_api_mapping" "mcp_server" {
  api_id      = aws_apigatewayv2_api.mcp_server.id
  domain_name = aws_apigatewayv2_domain_name.mcp_server.id
  stage       = aws_apigatewayv2_stage.mcp_server.id
}

# Route53 A レコード（カスタムドメイン → API Gateway ドメイン）
resource "aws_route53_record" "mcp_server" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = local.current_env.mcp_domain_name
  type    = "A"
  alias {
    name                   = aws_apigatewayv2_domain_name.mcp_server.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.mcp_server.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
