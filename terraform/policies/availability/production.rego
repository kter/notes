package main

import rego.v1

# ---------------------------------------------------------------------------
# Availability / DR — Production-only checks
# Check 1: DSQL cluster must have deletion_protection_enabled = true in prd
# Check 2: ECR repositories must have force_delete = false in prd
# Check 3: SQS queues must have a dead-letter queue (DLQ) configured
# Check 4: DLQ maxReceiveCount must be ≥ 1
# ---------------------------------------------------------------------------

# --- Check 1: DSQL deletion protection (prd only) ---

deny contains msg if {
	is_production
	rc := input.resource_changes[_]
	rc.type == "aws_dsql_cluster"
	resource_applies(rc)
	not rc.change.after.deletion_protection_enabled == true
	msg := sprintf(
		"[DR] %s: deletion_protection_enabled must be true in the prd workspace",
		[rc.address],
	)
}

# --- Check 2: ECR force_delete must be false in prd ---

deny contains msg if {
	is_production
	rc := input.resource_changes[_]
	rc.type == "aws_ecr_repository"
	resource_applies(rc)
	rc.change.after.force_delete == true
	msg := sprintf(
		"[DR] %s: force_delete must be false in the prd workspace",
		[rc.address],
	)
}

# --- Check 3: SQS queues must have a DLQ configured ---

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_sqs_queue"
	resource_applies(rc)

	# Skip queues that are themselves DLQs (identified by "-dlq-" in name)
	not contains(rc.change.after.name, "-dlq-")

	# redrive_policy is a JSON string; empty string or null means no DLQ
	redrive := object.get(rc.change.after, "redrive_policy", "")
	redrive == ""

	msg := sprintf(
		"[Availability] %s: SQS queue '%s' must have a dead-letter queue (redrive_policy) configured",
		[rc.address, rc.change.after.name],
	)
}

# --- Check 4: DLQ maxReceiveCount must be ≥ 1 ---

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_sqs_queue"
	resource_applies(rc)
	not contains(rc.change.after.name, "-dlq-")

	redrive_str := rc.change.after.redrive_policy
	redrive_str != ""
	redrive_str != null
	redrive := json.unmarshal(redrive_str)
	redrive.maxReceiveCount < 1

	msg := sprintf(
		"[Availability] %s: SQS redrive_policy maxReceiveCount must be ≥ 1 (got %d)",
		[rc.address, redrive.maxReceiveCount],
	)
}
