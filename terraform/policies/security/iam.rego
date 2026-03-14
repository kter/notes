package main

import rego.v1

# ---------------------------------------------------------------------------
# Security — IAM
# Check 1: Action must not contain "*"
# Check 2: Resource must not be "*" except for the permitted allowlist
# Check 3: Lambda execution roles must only trust Lambda-compatible services
# ---------------------------------------------------------------------------

# Actions that legitimately require Resource = "*" because the AWS API
# does not support resource-level restrictions for them.
_allowed_wildcard_resource_actions := {
	"aws-marketplace:ViewSubscriptions",
	"aws-marketplace:Subscribe",
	"aws-marketplace:Unsubscribe",
	"dsql:GenerateDbConnectAdminAuthToken",
}

# Service principals permitted in Lambda execution role trust policies
_allowed_lambda_trust_services := {
	"lambda.amazonaws.com",
	"ecs-tasks.amazonaws.com",
	"edgelambda.amazonaws.com",
}

# ---------------------------------------------------------------------------
# Helper: normalise Action to a set regardless of string or array
# ---------------------------------------------------------------------------
_actions_set(stmt) := {stmt.Action} if {
	is_string(stmt.Action)
}

_actions_set(stmt) := {a | a := stmt.Action[_]} if {
	not is_string(stmt.Action)
}

# ---------------------------------------------------------------------------
# Helper: normalise Resource to a set in the same way
# ---------------------------------------------------------------------------
_resources_set(stmt) := {stmt.Resource} if {
	is_string(stmt.Resource)
}

_resources_set(stmt) := {r | r := stmt.Resource[_]} if {
	not is_string(stmt.Resource)
}

# ---------------------------------------------------------------------------
# Helper: normalise Principal.Service to a set
# ---------------------------------------------------------------------------
_principal_services(principal) := {principal.Service} if {
	is_string(principal.Service)
}

_principal_services(principal) := {s | s := principal.Service[_]} if {
	not is_string(principal.Service)
}

# ---------------------------------------------------------------------------
# Check 1: Action wildcard ("*") is never allowed
# ---------------------------------------------------------------------------
deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_iam_role_policy"
	resource_applies(rc)
	policy := json.unmarshal(rc.change.after.policy)
	stmt := policy.Statement[_]
	actions := _actions_set(stmt)
	"*" in actions
	msg := sprintf("[IAM] %s: Action wildcard (*) is not allowed in IAM policy statements", [rc.address])
}

# ---------------------------------------------------------------------------
# Check 2: Resource wildcard ("*") is only allowed for actions in the
# pre-approved allowlist.
# ---------------------------------------------------------------------------
deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_iam_role_policy"
	resource_applies(rc)
	policy := json.unmarshal(rc.change.after.policy)
	stmt := policy.Statement[_]
	stmt.Effect == "Allow"

	# Statement uses Resource = "*" (or contains "*")
	resources := _resources_set(stmt)
	"*" in resources

	# At least one action is NOT in the allowlist
	actions := _actions_set(stmt)
	action := actions[_]
	not action in _allowed_wildcard_resource_actions

	msg := sprintf(
		"[IAM] %s: Resource wildcard (*) is not allowed for action '%s' (not in permitted allowlist)",
		[rc.address, action],
	)
}

# ---------------------------------------------------------------------------
# Check 3: Roles that trust lambda.amazonaws.com must not include
# unexpected service principals.
# ---------------------------------------------------------------------------
_trust_services(rc) := services if {
	rc.type == "aws_iam_role"
	policy := json.unmarshal(rc.change.after.assume_role_policy)
	services := {svc |
		stmt := policy.Statement[_]
		stmt.Effect == "Allow"
		svc := _principal_services(stmt.Principal)[_]
	}
}

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_iam_role"
	resource_applies(rc)

	services := _trust_services(rc)

	# This role trusts Lambda
	"lambda.amazonaws.com" in services

	# But also has an unexpected service principal
	svc := services[_]
	not svc in _allowed_lambda_trust_services

	msg := sprintf(
		"[IAM] %s: Lambda execution role has unexpected trust principal '%s'",
		[rc.address, svc],
	)
}
