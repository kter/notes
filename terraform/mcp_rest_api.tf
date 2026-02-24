# ============================================================================
# MCP OAuth Support - REST API Gateway
# ============================================================================

# This file defines REST API Gateway for MCP OAuth support.
# It uses OpenAPI to define OAuth metadata endpoints, DCR, and MCP endpoints.

# Locals for API Gateway URLs
locals {
  # REST API Gateway base URL
  rest_api_base_url = "https://${aws_api_gateway_rest_api.mcp_oauth.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.mcp_oauth.stage_name}"
  # OAuth authorization server metadata URL
  oauth_auth_server_url = "https://${aws_api_gateway_rest_api.mcp_oauth.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.mcp_oauth.stage_name}/.well-known/oauth-authorization-server"
}

# ============================================================================
# REST API Gateway (backend) - OpenAPI based
# ============================================================================

resource "aws_api_gateway_rest_api" "mcp_oauth" {
  name        = "${var.project_name}-mcp-oauth-${terraform.workspace}"
  description = "REST API Gateway for MCP OAuth support with OpenAPI definition"
  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

# REST API Gateway deployment
resource "aws_api_gateway_deployment" "mcp_oauth" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id

  triggers = {
    # Trigger on file changes to VTL templates
    vtl_auth_server_req = sha1(file("${path.module}/vtl/request_auth_server.vtl"))
    vtl_auth_server_res = sha1(file("${path.module}/vtl/oauth_auth_server.json"))
    vtl_protected_req   = sha1(file("${path.module}/vtl/request_protected_resource.vtl"))
    vtl_protected_res   = sha1(file("${path.module}/vtl/oauth_protected_resource.json"))
    vtl_dcr_request    = sha1(file("${path.module}/vtl/dcr_request.vtl"))
    vtl_dcr_response   = sha1(file("${path.module}/vtl/dcr_response.vtl"))
  }

  # Ensure all methods and integrations are created before deployment
  depends_on = [
    aws_api_gateway_integration.health_get,
    aws_api_gateway_integration.health_options,
    aws_api_gateway_integration.mcp_post,
    aws_api_gateway_integration.oauth_auth_server_get,
    aws_api_gateway_integration.oauth_auth_server_options,
    aws_api_gateway_integration.oauth_protected_resource_get,
    aws_api_gateway_integration.oauth_protected_resource_options,
    aws_api_gateway_integration.register_post,
  ]

  lifecycle {
    create_before_destroy = true
  }
}

# REST API Gateway stage
resource "aws_api_gateway_stage" "mcp_oauth" {
  deployment_id = aws_api_gateway_deployment.mcp_oauth.id
  rest_api_id   = aws_api_gateway_rest_api.mcp_oauth.id
  stage_name    = terraform.workspace

  # Enable access logging
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.mcp_rest_api_gateway.arn
    format         = jsonencode({
      requestId               = "$context.requestId"
      ip                      = "$context.identity.sourceIp"
      requestTime             = "$context.requestTime"
      httpMethod              = "$context.httpMethod"
      resourcePath            = "$context.resourcePath"
      status                  = "$context.status"
      protocol                = "$context.protocol"
      integrationLatency      = "$context.integrationLatency"
      integrationErrorMessage = "$context.integrationErrorMessage"
    })
  }

  # Enable stage variables for environment configuration
  variables = {
    environment = terraform.workspace
  }
}

# CloudWatch log group for REST API Gateway
resource "aws_cloudwatch_log_group" "mcp_rest_api_gateway" {
  name              = "/aws/api-gateway/${aws_api_gateway_rest_api.mcp_oauth.name}"
  retention_in_days = 7
}

# REST API Gateway account settings (for logging)
resource "aws_api_gateway_account" "main" {
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch.arn
}

# IAM role for API Gateway CloudWatch logging
resource "aws_iam_role" "api_gateway_cloudwatch" {
  name = "${var.project_name}-api-gateway-cloudwatch-${terraform.workspace}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "api_gateway_cloudwatch" {
  name = "cloudwatch-logs"
  role = aws_iam_role.api_gateway_cloudwatch.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
          "logs:PutLogEvents",
          "logs:GetLogEvents",
          "logs:FilterLogEvents"
        ]
        Resource = "*"
      }
    ]
  })
}

# Grant permission for API Gateway to invoke Lambda (for REST API Gateway)
resource "aws_lambda_permission" "mcp_server_rest_api_gateway" {
  statement_id  = "AllowRestAPIGatewayInvokeMCP"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.mcp_server.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.mcp_oauth.execution_arn}/*"
}

# ============================================================================
# REST API Gateway Resources
# ============================================================================

# OAuth Authorization Server Metadata endpoint
resource "aws_api_gateway_resource" "oauth_well_known" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  parent_id   = aws_api_gateway_rest_api.mcp_oauth.root_resource_id
  path_part   = ".well-known"
}

resource "aws_api_gateway_resource" "oauth_auth_server" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  parent_id   = aws_api_gateway_resource.oauth_well_known.id
  path_part   = "oauth-authorization-server"
}

# Protected Resource Server Metadata endpoint
resource "aws_api_gateway_resource" "oauth_protected_resource" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  parent_id   = aws_api_gateway_resource.oauth_well_known.id
  path_part   = "oauth-protected-resource"
}

# Health check endpoint
resource "aws_api_gateway_resource" "health" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  parent_id   = aws_api_gateway_rest_api.mcp_oauth.root_resource_id
  path_part   = "health"
}

# MCP endpoint
resource "aws_api_gateway_resource" "mcp" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  parent_id   = aws_api_gateway_rest_api.mcp_oauth.root_resource_id
  path_part   = "mcp"
}

# Register endpoint
resource "aws_api_gateway_resource" "register" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  parent_id   = aws_api_gateway_rest_api.mcp_oauth.root_resource_id
  path_part   = "register"
}

# ============================================================================
# GET /health - Mock integration
# ============================================================================
resource "aws_api_gateway_method" "health_get" {
  rest_api_id   = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id   = aws_api_gateway_resource.health.id
  http_method   = "GET"
  authorization = "NONE"
}

# OPTIONS method for CORS preflight
resource "aws_api_gateway_method" "health_options" {
  rest_api_id   = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id   = aws_api_gateway_resource.health.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "health_get" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.health.id
  http_method = aws_api_gateway_method.health_get.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({statusCode = 200})
  }
}

resource "aws_api_gateway_integration" "health_options" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.health.id
  http_method = aws_api_gateway_method.health_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({statusCode = 200})
  }
}

resource "aws_api_gateway_method_response" "health_200" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.health.id
  http_method = aws_api_gateway_method.health_get.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

resource "aws_api_gateway_method_response" "health_options_200" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.health.id
  http_method = aws_api_gateway_method.health_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "health_200" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.health.id
  http_method = aws_api_gateway_method.health_get.http_method
  status_code = aws_api_gateway_method_response.health_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
  }

  response_templates = {
    "application/json" = "{\"status\":\"ok\",\"environment\":\"${terraform.workspace}\"}"
  }
}

resource "aws_api_gateway_integration_response" "health_options_200" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.health.id
  http_method = aws_api_gateway_method.health_options.http_method
  status_code = aws_api_gateway_method_response.health_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Max-Age"       = "'86400'"
  }
}

# ============================================================================
# GET /.well-known/oauth-authorization-server - Mock integration
# ============================================================================
resource "aws_api_gateway_method" "oauth_auth_server_get" {
  rest_api_id   = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id   = aws_api_gateway_resource.oauth_auth_server.id
  http_method   = "GET"
  authorization = "NONE"
}

# OPTIONS method for CORS preflight
resource "aws_api_gateway_method" "oauth_auth_server_options" {
  rest_api_id   = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id   = aws_api_gateway_resource.oauth_auth_server.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "oauth_auth_server_get" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.oauth_auth_server.id
  http_method = aws_api_gateway_method.oauth_auth_server_get.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({statusCode = 200})
  }
}

resource "aws_api_gateway_integration" "oauth_auth_server_options" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.oauth_auth_server.id
  http_method = aws_api_gateway_method.oauth_auth_server_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({statusCode = 200})
  }
}

resource "aws_api_gateway_method_response" "oauth_auth_server_200" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.oauth_auth_server.id
  http_method = aws_api_gateway_method.oauth_auth_server_get.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

resource "aws_api_gateway_method_response" "oauth_auth_server_options_200" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.oauth_auth_server.id
  http_method = aws_api_gateway_method.oauth_auth_server_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "oauth_auth_server_200" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.oauth_auth_server.id
  http_method = aws_api_gateway_method.oauth_auth_server_get.http_method
  status_code = aws_api_gateway_method_response.oauth_auth_server_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
  }

  response_templates = {
    "application/json" = "{\"issuer\":\"https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}\",\"authorization_endpoint\":\"https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com/oauth2/authorize\",\"token_endpoint\":\"https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com/oauth2/token\",\"jwks_uri\":\"https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}/.well-known/jwks.json\",\"registration_endpoint\":\"https://${aws_api_gateway_rest_api.mcp_oauth.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.mcp_oauth.stage_name}/register\",\"response_types_supported\":[\"code\"],\"grant_types_supported\":[\"authorization_code\",\"refresh_token\"],\"token_endpoint_auth_methods_supported\":[\"none\",\"client_secret_basic\"],\"scopes_supported\":[\"openid\",\"email\",\"profile\"],\"code_challenge_methods_supported\":[\"S256\"],\"authorization_servers\":[\"https://${aws_api_gateway_rest_api.mcp_oauth.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.mcp_oauth.stage_name}/.well-known/oauth-authorization-server\"]}"
  }
}

resource "aws_api_gateway_integration_response" "oauth_auth_server_options_200" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.oauth_auth_server.id
  http_method = aws_api_gateway_method.oauth_auth_server_options.http_method
  status_code = aws_api_gateway_method_response.oauth_auth_server_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Max-Age"       = "'86400'"
  }
}

# ============================================================================
# GET /.well-known/oauth-protected-resource - Mock integration
# ============================================================================
resource "aws_api_gateway_method" "oauth_protected_resource_get" {
  rest_api_id   = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id   = aws_api_gateway_resource.oauth_protected_resource.id
  http_method   = "GET"
  authorization = "NONE"
}

# OPTIONS method for CORS preflight
resource "aws_api_gateway_method" "oauth_protected_resource_options" {
  rest_api_id   = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id   = aws_api_gateway_resource.oauth_protected_resource.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "oauth_protected_resource_get" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.oauth_protected_resource.id
  http_method = aws_api_gateway_method.oauth_protected_resource_get.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({statusCode = 200})
  }
}

resource "aws_api_gateway_integration" "oauth_protected_resource_options" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.oauth_protected_resource.id
  http_method = aws_api_gateway_method.oauth_protected_resource_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = jsonencode({statusCode = 200})
  }
}

resource "aws_api_gateway_method_response" "oauth_protected_resource_200" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.oauth_protected_resource.id
  http_method = aws_api_gateway_method.oauth_protected_resource_get.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
  }
}

resource "aws_api_gateway_method_response" "oauth_protected_resource_options_200" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.oauth_protected_resource.id
  http_method = aws_api_gateway_method.oauth_protected_resource_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = true
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Max-Age"       = true
  }
}

resource "aws_api_gateway_integration_response" "oauth_protected_resource_200" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.oauth_protected_resource.id
  http_method = aws_api_gateway_method.oauth_protected_resource_get.http_method
  status_code = aws_api_gateway_method_response.oauth_protected_resource_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
  }

  response_templates = {
    "application/json" = "{\"resource\":\"https://${aws_api_gateway_rest_api.mcp_oauth.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.mcp_oauth.stage_name}/mcp\",\"authorization_servers\":[\"https://${aws_api_gateway_rest_api.mcp_oauth.id}.execute-api.${var.aws_region}.amazonaws.com/${aws_api_gateway_stage.mcp_oauth.stage_name}/.well-known/oauth-authorization-server\"],\"scopes_supported\":[\"openid\",\"email\",\"profile\"]}"
  }
}

resource "aws_api_gateway_integration_response" "oauth_protected_resource_options_200" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.oauth_protected_resource.id
  http_method = aws_api_gateway_method.oauth_protected_resource_options.http_method
  status_code = aws_api_gateway_method_response.oauth_protected_resource_options_200.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,Authorization'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Max-Age"       = "'86400'"
  }
}

# ============================================================================
# POST /register - AWS integration with Cognito
# ============================================================================
resource "aws_api_gateway_method" "register_post" {
  rest_api_id   = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id   = aws_api_gateway_resource.register.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "register_post" {
  rest_api_id            = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id            = aws_api_gateway_resource.register.id
  http_method            = aws_api_gateway_method.register_post.http_method
  type                   = "AWS"
  integration_http_method = "POST"
  uri                    = "arn:aws:apigateway:${var.aws_region}:cognito-idp:path/${aws_cognito_user_pool.main.id}"
  credentials            = aws_iam_role.mcp_rest_api_cognito.arn

  request_parameters = {
    "integration.request.header.Content-Type" = "'application/x-amz-json-1.1'"
  }

  request_templates = {
    "application/json" = templatefile("${path.module}/vtl/dcr_request.vtl", {
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
    })
  }
}

resource "aws_api_gateway_method_response" "register_201" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.register.id
  http_method = aws_api_gateway_method.register_post.http_method
  status_code = "201"
}

resource "aws_api_gateway_integration_response" "register_201" {
  rest_api_id = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id = aws_api_gateway_resource.register.id
  http_method = aws_api_gateway_method.register_post.http_method
  status_code = aws_api_gateway_method_response.register_201.status_code
  response_templates = {
    "application/json" = file("${path.module}/vtl/dcr_response.vtl")
  }
}

# ============================================================================
# POST /mcp - Lambda proxy integration
# ============================================================================
resource "aws_api_gateway_method" "mcp_post" {
  rest_api_id   = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id   = aws_api_gateway_resource.mcp.id
  http_method   = "POST"
  authorization = "NONE"  # Lambda handles auth
}

resource "aws_api_gateway_integration" "mcp_post" {
  rest_api_id             = aws_api_gateway_rest_api.mcp_oauth.id
  resource_id             = aws_api_gateway_resource.mcp.id
  http_method             = aws_api_gateway_method.mcp_post.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST"
  uri                     = "arn:aws:apigateway:${var.aws_region}:lambda:path/2015-03-31/functions/${aws_lambda_function.mcp_server.arn}/invocations"
}

# Gateway response for 401 with WWW-Authenticate header
resource "aws_api_gateway_gateway_response" "mcp_401" {
  rest_api_id   = aws_api_gateway_rest_api.mcp_oauth.id
  status_code   = "401"
  response_type = "DEFAULT_4XX"

  response_parameters = {
    "gatewayresponse.header.WWW-Authenticate" = "'Bearer resource_metadata=\"https://${aws_apigatewayv2_api.mcp_oauth_front.id}.execute-api.${var.aws_region}.amazonaws.com/.well-known/oauth-protected-resource\"'"
  }

  response_templates = {
    "application/json" = "{ \"error\": \"unauthorized\", \"error_description\": \"Authentication required\" }"
  }
}
