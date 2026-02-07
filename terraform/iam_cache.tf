resource "aws_iam_role_policy" "cache_access" {
  name = "cache-access"
  role = aws_iam_role.backend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = [
          "${aws_s3_bucket.cache.arn}/*"
        ]
      }
    ]
  })
}
