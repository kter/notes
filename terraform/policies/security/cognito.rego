package main

import rego.v1

# ---------------------------------------------------------------------------
# Security — Cognito
# Check 1: prevent_user_existence_errors must be "ENABLED"
# Check 2: Access token validity must not exceed 24 hours
# ---------------------------------------------------------------------------

# Convert access token validity to hours for consistent comparison.
# token_validity_units is a list (Terraform block rendered as array in plan JSON).
_access_token_hours(after) := hours if {
	units := after.token_validity_units[_]
	units.access_token == "hours"
	hours := after.access_token_validity
}

_access_token_hours(after) := hours if {
	units := after.token_validity_units[_]
	units.access_token == "minutes"
	hours := after.access_token_validity / 60
}

_access_token_hours(after) := hours if {
	units := after.token_validity_units[_]
	units.access_token == "days"
	hours := after.access_token_validity * 24
}

# --- Check 1: prevent_user_existence_errors ---

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_cognito_user_pool_client"
	resource_applies(rc)
	not rc.change.after.prevent_user_existence_errors == "ENABLED"
	msg := sprintf(
		"[Cognito] %s: prevent_user_existence_errors must be 'ENABLED' (got: %v)",
		[rc.address, rc.change.after.prevent_user_existence_errors],
	)
}

# --- Check 2: Access token validity ≤ 24 hours ---

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_cognito_user_pool_client"
	resource_applies(rc)
	hours := _access_token_hours(rc.change.after)
	hours > 24
	msg := sprintf(
		"[Cognito] %s: access token validity %v hours exceeds the 24-hour maximum",
		[rc.address, hours],
	)
}
