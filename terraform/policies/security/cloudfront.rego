package main

import rego.v1

# ---------------------------------------------------------------------------
# Security — CloudFront
# Check 1: minimum_protocol_version must be TLSv1.2_2021 or newer
# Check 2: S3 origins must use OAC (not the legacy OAI)
# ---------------------------------------------------------------------------

# TLS version ranking (higher = newer/stronger)
_tls_rank := {
	"TLSv1": 1,
	"TLSv1_2016": 2,
	"TLSv1.1_2016": 3,
	"TLSv1.2_2018": 4,
	"TLSv1.2_2019": 5,
	"TLSv1.2_2021": 6,
	"TLSv1.3_2022": 7,
}

_minimum_required_tls := "TLSv1.2_2021"

_minimum_required_rank := _tls_rank[_minimum_required_tls]

# --- Check 1: minimum_protocol_version ---

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_cloudfront_distribution"
	resource_applies(rc)
	cert := rc.change.after.viewer_certificate[_]
	version := cert.minimum_protocol_version
	rank := object.get(_tls_rank, version, 0)
	rank < _minimum_required_rank
	msg := sprintf(
		"[CloudFront] %s: minimum_protocol_version '%s' is below the required '%s'",
		[rc.address, version, _minimum_required_tls],
	)
}

# --- Check 2: S3 origins must use OAC (origin_access_control_id must be set) ---

deny contains msg if {
	rc := input.resource_changes[_]
	rc.type == "aws_cloudfront_distribution"
	resource_applies(rc)
	origin := rc.change.after.origin[_]

	# Identify S3 origins by domain name pattern (*.s3.*.amazonaws.com)
	contains(origin.domain_name, ".s3.")
	contains(origin.domain_name, ".amazonaws.com")

	# OAC not configured
	oac_id := object.get(origin, "origin_access_control_id", "")
	oac_id == ""

	msg := sprintf(
		"[CloudFront] %s: S3 origin '%s' must use OAC (origin_access_control_id is not set)",
		[rc.address, origin.origin_id],
	)
}
