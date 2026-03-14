package main

import rego.v1

# ---------------------------------------------------------------------------
# Shared helpers used by all policy files (same package = shared namespace)
# ---------------------------------------------------------------------------

# resource_applies/1: true when the change will modify live infrastructure
resource_applies(rc) if {
	rc.change.actions[_] == "create"
}

resource_applies(rc) if {
	rc.change.actions[_] == "update"
}

# workspaces: set of environment names inferred from S3 bucket names
# e.g. "notes-app-frontend-dev"  → "dev"
#      "notes-app-frontend-prd"  → "prd"
workspaces contains ws if {
	rc := input.resource_changes[_]
	rc.type == "aws_s3_bucket"
	rc.change.after != null
	name := rc.change.after.bucket
	parts := split(name, "-")
	ws := parts[count(parts) - 1]
	ws in {"dev", "prd"}
}

# is_production: true when the plan is being applied to the prd workspace
is_production if {
	"prd" in workspaces
}
