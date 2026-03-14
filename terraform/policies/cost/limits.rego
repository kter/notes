package main

import rego.v1

# ---------------------------------------------------------------------------
# Cost Management
# Check 1: Lambda memory_size should not exceed 2048 MB (warn)
# Check 2: CloudFront price_class must not be PriceClass_All (warn)
# Check 3: S3 cache bucket must have a lifecycle expiration rule
# ---------------------------------------------------------------------------

# --- Check 1: Lambda memory_size ≤ 2048 MB (soft limit — warn) ---

warn contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_lambda_function"
	resource_applies(rc)
	rc.change.after.memory_size > 2048
	msg := sprintf(
		"[Cost] %s: memory_size %d MB exceeds the recommended 2048 MB limit — review before deploying",
		[rc.address, rc.change.after.memory_size],
	)
}

# --- Check 2: CloudFront price class must not be PriceClass_All ---

warn contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_cloudfront_distribution"
	resource_applies(rc)
	rc.change.after.price_class == "PriceClass_All"
	msg := sprintf(
		"[Cost] %s: price_class 'PriceClass_All' enables all edge locations — use PriceClass_200 or lower",
		[rc.address],
	)
}

# --- Check 3: S3 cache bucket must have a lifecycle expiration rule ---

# Collect bucket names that have at least one lifecycle rule with an expiration
_buckets_with_lifecycle_expiry contains bucket if {
	rc := input.resource_changes[_]
	rc.type == "aws_s3_bucket_lifecycle_configuration"
	resource_applies(rc)
	rule := rc.change.after.rule[_]
	rule.status == "Enabled"
	expiry := rule.expiration[_]
	expiry.days > 0
	bucket := rc.change.after.bucket
}

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_s3_bucket"
	resource_applies(rc)
	contains(rc.change.after.bucket, "-cache-")
	not rc.change.after.bucket in _buckets_with_lifecycle_expiry
	msg := sprintf(
		"[Cost] %s: cache bucket '%s' must have a lifecycle expiration rule to prevent unbounded storage growth",
		[rc.address, rc.change.after.bucket],
	)
}
