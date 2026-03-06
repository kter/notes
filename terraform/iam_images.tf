resource "aws_iam_role_policy" "images_access" {
  name = "images-access"
  role = aws_iam_role.backend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject"
        ]
        Resource = [
          "${aws_s3_bucket.images.arn}/*"
        ]
      }
    ]
  })
}
