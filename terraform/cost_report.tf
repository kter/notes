# Cost Report Lambda Function
# Sends daily AWS cost reports via email

data "archive_file" "cost_report" {
  type        = "zip"
  source_file = "${path.module}/../backend/app/cost_report.py"
  output_path = "${path.module}/cost_report.zip"
}

# IAM Role for Cost Report Lambda
resource "aws_iam_role" "cost_report" {
  name = "${var.project_name}-cost-report-${terraform.workspace}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-cost-report-${terraform.workspace}"
  }
}

# Cost Explorer access policy
resource "aws_iam_role_policy" "cost_explorer_access" {
  name = "cost-explorer-access"
  role = aws_iam_role.cost_report.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ce:GetCostAndUsage",
          "ce:GetCostForecast"
        ]
        Resource = "*"
      }
    ]
  })
}

# SES send email policy
resource "aws_iam_role_policy" "ses_send_email" {
  name = "ses-send-email"
  role = aws_iam_role.cost_report.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
      }
    ]
  })
}

# CloudWatch Logs policy for Cost Report Lambda
resource "aws_iam_role_policy" "cost_report_logs" {
  name = "logs-access"
  role = aws_iam_role.cost_report.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# Lambda Function
resource "aws_lambda_function" "cost_report" {
  function_name    = "${var.project_name}-cost-report-${terraform.workspace}"
  role             = aws_iam_role.cost_report.arn
  handler          = "cost_report.handler"
  runtime          = "python3.12"
  filename         = data.archive_file.cost_report.output_path
  source_code_hash = data.archive_file.cost_report.output_base64sha256
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      TO_EMAIL   = "takahashi@tomohiko.io"
      FROM_EMAIL = "noreply@${local.current_env.hosted_zone_name}"
    }
  }

  tags = {
    Name = "${var.project_name}-cost-report-${terraform.workspace}"
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "cost_report" {
  name              = "/aws/lambda/${aws_lambda_function.cost_report.function_name}"
  retention_in_days = 14

  tags = {
    Name = "${var.project_name}-cost-report-${terraform.workspace}"
  }
}

# EventBridge Rule - Daily at 9:00 AM JST (0:00 UTC)
resource "aws_cloudwatch_event_rule" "cost_report_schedule" {
  name                = "${var.project_name}-cost-report-schedule-${terraform.workspace}"
  description         = "Daily AWS cost report"
  schedule_expression = "cron(0 0 * * ? *)"

  tags = {
    Name = "${var.project_name}-cost-report-schedule-${terraform.workspace}"
  }
}

# EventBridge Target
resource "aws_cloudwatch_event_target" "cost_report" {
  rule      = aws_cloudwatch_event_rule.cost_report_schedule.name
  target_id = "cost-report-lambda"
  arn       = aws_lambda_function.cost_report.arn
}

# Lambda Permission for EventBridge
resource "aws_lambda_permission" "cost_report_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cost_report.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.cost_report_schedule.arn
}

# SES Email Identity for sender domain (if not exists)
resource "aws_ses_domain_identity" "sender" {
  domain = local.current_env.hosted_zone_name
}

# SES Domain Identity Verification DNS Record
resource "aws_route53_record" "ses_verification" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "_amazonses.${aws_ses_domain_identity.sender.domain}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.sender.verification_token]
}

# SES Domain Identity Verification
resource "aws_ses_domain_identity_verification" "sender" {
  domain     = aws_ses_domain_identity.sender.id
  depends_on = [aws_route53_record.ses_verification]
}

# SES Email Identity for recipient (for sandbox mode)
resource "aws_ses_email_identity" "recipient" {
  email = "takahashi@tomohiko.io"
}

# Output
output "cost_report_lambda_name" {
  description = "Cost Report Lambda function name"
  value       = aws_lambda_function.cost_report.function_name
}
