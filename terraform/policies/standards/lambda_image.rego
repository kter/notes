package main

import rego.v1

# ---------------------------------------------------------------------------
# Lambda Image Pinning
# Container-based Lambda functions must reference their image by immutable
# digest (repo@sha256:...), never by mutable tag (repo:latest).
#
# Background: the deployed digest is injected at deploy time via
# -var="lambda_image_tag=<digest>" and is only recorded in Terraform state.
# Any plan that resolves image_uri back to a tag means that pinning is being
# silently dropped -- which is exactly what a bare `terraform apply` used to do
# before lambda_image_tag lost its "latest" default.
# ---------------------------------------------------------------------------

# Resolve image_uri only when the plan actually sets one. Zip-based functions
# have no image_uri, and a value that is unknown until apply is not a violation.
_image_uri(rc) := uri if {
	uri := rc.change.after.image_uri
	is_string(uri)
}

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_lambda_function"
	resource_applies(rc)
	uri := _image_uri(rc)
	not contains(uri, "@sha256:")
	msg := sprintf(
		"[LambdaImage] %s: image_uri must be digest-pinned ('repo@sha256:...'), got '%s'",
		[rc.address, uri],
	)
}
