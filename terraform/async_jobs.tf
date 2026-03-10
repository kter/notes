resource "aws_sns_topic" "ai_edit_jobs" {
  name = "${var.project_name}-ai-edit-jobs-${terraform.workspace}"

  tags = {
    Name = "${var.project_name}-ai-edit-jobs-${terraform.workspace}"
  }
}

resource "aws_sqs_queue" "ai_edit_jobs_dlq" {
  name                      = "${var.project_name}-ai-edit-jobs-dlq-${terraform.workspace}"
  message_retention_seconds = 1209600

  tags = {
    Name = "${var.project_name}-ai-edit-jobs-dlq-${terraform.workspace}"
  }
}

resource "aws_sqs_queue" "ai_edit_jobs" {
  name                       = "${var.project_name}-ai-edit-jobs-${terraform.workspace}"
  visibility_timeout_seconds = 180
  message_retention_seconds  = 1209600

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.ai_edit_jobs_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "${var.project_name}-ai-edit-jobs-${terraform.workspace}"
  }
}

resource "aws_sqs_queue_policy" "ai_edit_jobs" {
  queue_url = aws_sqs_queue.ai_edit_jobs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowSNSToSendMessages"
        Effect = "Allow"
        Principal = {
          Service = "sns.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.ai_edit_jobs.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.ai_edit_jobs.arn
          }
        }
      }
    ]
  })
}

resource "aws_sns_topic_subscription" "ai_edit_jobs_queue" {
  topic_arn            = aws_sns_topic.ai_edit_jobs.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.ai_edit_jobs.arn
  raw_message_delivery = true
}

resource "aws_lambda_event_source_mapping" "ai_edit_jobs" {
  event_source_arn        = aws_sqs_queue.ai_edit_jobs.arn
  function_name           = aws_lambda_function.api.arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = 5
  }
}
