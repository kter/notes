#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_path="$project_dir/scripts/changed_unit_test_targets.sh"

assert_targets() {
  local changed_files="$1"
  local expected="$2"
  local output

  output="$(
    CHANGED_UNIT_TEST_FILES="$changed_files" \
      "$script_path"
  )"

  if [ "$output" != "$expected" ]; then
    echo "unexpected targets" >&2
    echo "expected:" >&2
    printf '%s\n' "$expected" >&2
    echo "actual:" >&2
    printf '%s\n' "$output" >&2
    exit 1
  fi
}

assert_targets 'backend/app/main.py' 'test-backend'
assert_targets 'frontend/src/app/page.tsx' 'test-frontend'
assert_targets 'lambda/mcp_server/app.py' 'test-mcp-lambda-unit'
assert_targets 'lambda/auth_manager/main.py' 'test-auth-manager-unit'
assert_targets $'backend/app/main.py\nfrontend/src/app/page.tsx\nbackend/app/config.py' $'test-backend\ntest-frontend'
assert_targets $'README.md\nterraform/main.tf' ''
