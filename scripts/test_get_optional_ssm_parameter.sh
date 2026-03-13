#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="$project_dir/scripts/get_optional_ssm_parameter.sh"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

fake_aws="$tmpdir/aws"

assert_eq() {
  local actual="$1"
  local expected="$2"

  if [ "$actual" != "$expected" ]; then
    echo "unexpected output" >&2
    echo "expected: $expected" >&2
    echo "actual: $actual" >&2
    exit 1
  fi
}

assert_success_with_value() {
  local output

  output="$(
    PATH="$tmpdir:$PATH" \
      AWS_STUB_MODE=success \
      "$script_path" "/notes-app/prd/sentry-dsn-frontend" "ap-northeast-1" "prd"
  )"

  assert_eq "$output" "https://public@example.ingest.sentry.io/123"
}

assert_missing_parameter_returns_empty() {
  local output

  output="$(
    PATH="$tmpdir:$PATH" \
      AWS_STUB_MODE=missing \
      "$script_path" "/notes-app/prd/sentry-dsn-frontend" "ap-northeast-1" "prd"
  )"

  assert_eq "$output" ""
}

assert_other_aws_errors_fail() {
  if PATH="$tmpdir:$PATH" AWS_STUB_MODE=access-denied "$script_path" "/notes-app/prd/sentry-dsn-frontend" "ap-northeast-1" "prd" >/dev/null 2>&1; then
    echo "expected helper to fail on non-ParameterNotFound aws errors" >&2
    exit 1
  fi
}

printf '%s\n' '#!/usr/bin/env bash' > "$fake_aws"
printf '%s\n' 'set -euo pipefail' >> "$fake_aws"
printf '%s\n' 'case "${AWS_STUB_MODE:-}" in' >> "$fake_aws"
printf '%s\n' '  success)' >> "$fake_aws"
printf '%s\n' "    printf '%s\\n' 'https://public@example.ingest.sentry.io/123'" >> "$fake_aws"
printf '%s\n' '    ;;' >> "$fake_aws"
printf '%s\n' '  missing)' >> "$fake_aws"
printf '%s\n' "    printf '%s\\n' 'An error occurred (ParameterNotFound) when calling the GetParameter operation:' >&2" >> "$fake_aws"
printf '%s\n' '    exit 254' >> "$fake_aws"
printf '%s\n' '    ;;' >> "$fake_aws"
printf '%s\n' '  access-denied)' >> "$fake_aws"
printf '%s\n' "    printf '%s\\n' 'An error occurred (AccessDeniedException) when calling the GetParameter operation:' >&2" >> "$fake_aws"
printf '%s\n' '    exit 254' >> "$fake_aws"
printf '%s\n' '    ;;' >> "$fake_aws"
printf '%s\n' '  *)' >> "$fake_aws"
printf '%s\n' "    printf '%s\\n' 'unexpected AWS_STUB_MODE' >&2" >> "$fake_aws"
printf '%s\n' '    exit 1' >> "$fake_aws"
printf '%s\n' '    ;;' >> "$fake_aws"
printf '%s\n' 'esac' >> "$fake_aws"
chmod +x "$fake_aws"

assert_success_with_value
assert_missing_parameter_returns_empty
assert_other_aws_errors_fail
