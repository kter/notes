package main

import rego.v1

# ---------------------------------------------------------------------------
# Security — Lambda & ECR
# Check 1: Lambda timeout must be ≤ 900 seconds (AWS max)
# Check 2: Lambda memory_size must be ≤ 3008 MB (AWS max)
# Check 3: Every Lambda function must have an explicit CloudWatch log group
# Check 4: ECR repositories must have scan_on_push = true
# ---------------------------------------------------------------------------

# --- Check 1: Lambda timeout ---

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_lambda_function"
	resource_applies(rc)
	rc.change.after.timeout > 900
	msg := sprintf(
		"[Lambda] %s: timeout %d seconds exceeds the 900-second AWS maximum",
		[rc.address, rc.change.after.timeout],
	)
}

# --- Check 2: Lambda memory_size ---

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_lambda_function"
	resource_applies(rc)
	rc.change.after.memory_size > 3008
	msg := sprintf(
		"[Lambda] %s: memory_size %d MB exceeds the 3008 MB AWS maximum",
		[rc.address, rc.change.after.memory_size],
	)
}

# --- Check 3: Every Lambda must have an explicit CloudWatch log group ---

# Collect log group names that are being created/updated
_log_group_names contains name if {
	rc := input.resource_changes[_]
	rc.type == "aws_cloudwatch_log_group"
	resource_applies(rc)
	name := rc.change.after.name
}

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_lambda_function"
	resource_applies(rc)
	fn_name := rc.change.after.function_name
	expected_log_group := sprintf("/aws/lambda/%s", [fn_name])
	not expected_log_group in _log_group_names
	msg := sprintf(
		"[Lambda] %s: no aws_cloudwatch_log_group found for log group '%s'",
		[rc.address, expected_log_group],
	)
}

# --- Check 4: ECR scan_on_push ---

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_ecr_repository"
	resource_applies(rc)
	cfg := rc.change.after.image_scanning_configuration[_]
	not cfg.scan_on_push == true
	msg := sprintf("[ECR] %s: image_scanning_configuration.scan_on_push must be true", [rc.address])
}
