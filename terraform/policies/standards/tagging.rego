package main

import rego.v1

# ---------------------------------------------------------------------------
# Tagging Standards
# Check 1: All taggable resources must have ManagedBy = "terraform"
#           (set via providers.tf default_tags — check for individual overrides)
# Check 2: Environment tag must be "dev" or "prd"
# ---------------------------------------------------------------------------

# Resource types that support the tags_all computed attribute in the AWS provider.
_taggable_resource_types := {
	"aws_s3_bucket",
	"aws_lambda_function",
	"aws_ecr_repository",
	"aws_iam_role",
	"aws_sqs_queue",
	"aws_sns_topic",
	"aws_cognito_user_pool",
	"aws_cognito_user_pool_client",
	"aws_apigatewayv2_api",
	"aws_cloudwatch_log_group",
	"aws_cloudfront_distribution",
	"aws_cloudfront_origin_access_control",
	"aws_dsql_cluster",
}

_valid_environments := {"dev", "prd"}

# --- Check 1: ManagedBy tag must be "terraform" ---
# providers.tf sets this via default_tags; individual resource overrides must not remove it.

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type in _taggable_resource_types
	resource_applies(rc)
	tags := object.get(rc.change.after, "tags_all", {})
	managed_by := object.get(tags, "ManagedBy", "")
	managed_by != "terraform"
	msg := sprintf(
		"[Tags] %s: ManagedBy tag must be 'terraform' (got: '%s'). Do not override the default_tags.",
		[rc.address, managed_by],
	)
}

# --- Check 2: Environment tag must be "dev" or "prd" ---

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type in _taggable_resource_types
	resource_applies(rc)
	tags := object.get(rc.change.after, "tags_all", {})
	env := object.get(tags, "Environment", "")
	not env in _valid_environments
	msg := sprintf(
		"[Tags] %s: Environment tag must be 'dev' or 'prd' (got: '%s')",
		[rc.address, env],
	)
}
