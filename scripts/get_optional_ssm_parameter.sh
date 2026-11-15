#!/usr/bin/env bash

set -euo pipefail

parameter_name="${1:?parameter name is required}"
aws_region="${2:?aws region is required}"
# Optional: empty means "use the credentials in the environment" (GitHub
# Actions OIDC, Makefile DEPLOY_CREDENTIALS=env). Local runs pass the profile.
aws_profile="${3:-}"

profile_args=()
if [ -n "$aws_profile" ]; then
  profile_args=(--profile "$aws_profile")
fi

if response="$(
  aws ssm get-parameter \
    --name "$parameter_name" \
    --with-decryption \
    --region "$aws_region" \
    "${profile_args[@]}" \
    --query 'Parameter.Value' \
    --output text 2>&1
)"; then
  printf '%s\n' "$response"
  exit 0
fi

if printf '%s' "$response" | grep -q "ParameterNotFound"; then
  exit 0
fi

printf '%s\n' "$response" >&2
exit 1
