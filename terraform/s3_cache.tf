resource "aws_s3_bucket" "cache" {
  bucket = "${var.project_name}-cache-${terraform.workspace}"

  tags = {
    Name = "${var.project_name}-cache-${terraform.workspace}"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "cache" {
  bucket = aws_s3_bucket.cache.id

  rule {
    id     = "expire-cache"
    status = "Enabled"

    filter {
      prefix = ""
    }

    expiration {
      days = 30
    }
  }
}

resource "aws_s3_bucket_public_access_block" "cache" {
  bucket = aws_s3_bucket.cache.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
