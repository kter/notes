package main

import rego.v1

# ---------------------------------------------------------------------------
# Security — S3
# Check 1: All S3 public-access-block settings must be enabled
# Check 2: All S3 buckets must have server-side encryption configured (warn)
# ---------------------------------------------------------------------------

# --- Check 1: Public access block settings ---

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_s3_bucket_public_access_block"
	resource_applies(rc)
	not rc.change.after.block_public_acls == true
	msg := sprintf("[S3] %s: block_public_acls must be true", [rc.address])
}

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_s3_bucket_public_access_block"
	resource_applies(rc)
	not rc.change.after.block_public_policy == true
	msg := sprintf("[S3] %s: block_public_policy must be true", [rc.address])
}

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_s3_bucket_public_access_block"
	resource_applies(rc)
	not rc.change.after.ignore_public_acls == true
	msg := sprintf("[S3] %s: ignore_public_acls must be true", [rc.address])
}

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_s3_bucket_public_access_block"
	resource_applies(rc)
	not rc.change.after.restrict_public_buckets == true
	msg := sprintf("[S3] %s: restrict_public_buckets must be true", [rc.address])
}

# --- Check 2: Server-side encryption (warn — not yet enforced for all buckets) ---

# Collect bucket names that have an SSE configuration resource
_buckets_with_sse contains bucket if {
	rc := input.resource_changes[_]
	rc.type == "aws_s3_bucket_server_side_encryption_configuration"
	resource_applies(rc)
	bucket := rc.change.after.bucket
}

warn contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_s3_bucket"
	resource_applies(rc)
	bucket := rc.change.after.bucket
	not bucket in _buckets_with_sse
	msg := sprintf("[S3] %s: server-side encryption configuration is missing (bucket: %s)", [rc.address, bucket])
}
