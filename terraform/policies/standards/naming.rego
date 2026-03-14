package main

import rego.v1

# ---------------------------------------------------------------------------
# Naming Standards
# Check 1: Primary resource names must start with "notes-app-"
# Check 2: Primary resource names must end with "-dev" or "-prd"
#           (i.e. follow the {project}-{resource}-{env} pattern)
# ---------------------------------------------------------------------------

# Resource types and the attribute that carries the canonical name.
# Only resource types where a meaningful, user-controlled name attribute exists.
_named_resource_attr := {
	"aws_s3_bucket": "bucket",
	"aws_lambda_function": "function_name",
	"aws_ecr_repository": "name",
	"aws_iam_role": "name",
	"aws_sqs_queue": "name",
	"aws_sns_topic": "name",
	"aws_cognito_user_pool": "name",
	"aws_apigatewayv2_api": "name",
	# Note: aws_cloudwatch_log_group is excluded — Lambda log groups use the
	# /aws/lambda/<function_name> convention which is not project-prefixed.
	"aws_cloudfront_origin_access_control": "name",
}

# Resolve the name string for a resource change (direct attribute)
_resource_name(rc) := name if {
	attr := _named_resource_attr[rc.type]
	name := rc.change.after[attr]
}

# Valid environment suffixes
_valid_env_suffixes := {"-dev", "-prd"}

_has_valid_env_suffix(name) if {
	suffix := _valid_env_suffixes[_]
	endswith(name, suffix)
}

# --- Check 1: Name must start with "notes-app-" ---

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type in object.keys(_named_resource_attr)
	resource_applies(rc)
	name := _resource_name(rc)
	not startswith(name, "notes-app-")
	msg := sprintf(
		"[Naming] %s: resource name '%s' must start with 'notes-app-'",
		[rc.address, name],
	)
}

# --- Check 2: Name must end with a valid environment suffix ---

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type in object.keys(_named_resource_attr)
	resource_applies(rc)
	name := _resource_name(rc)
	not _has_valid_env_suffix(name)
	msg := sprintf(
		"[Naming] %s: resource name '%s' must end with '-dev' or '-prd'",
		[rc.address, name],
	)
}
