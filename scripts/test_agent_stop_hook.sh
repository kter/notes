#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hook_script="$project_dir/scripts/agent_stop_hook_unit_tests.sh"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

log_file="$tmp_dir/make.log"
stderr_file="$tmp_dir/stderr.log"
stdout_file="$tmp_dir/stdout.log"
mock_make="$tmp_dir/mock-make.sh"

cat >"$mock_make" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$AGENT_STOP_HOOK_TEST_LOG"
if [ "${AGENT_STOP_HOOK_TEST_EXIT_CODE:-0}" -eq 0 ]; then
  exit 0
fi
printf '%s\n' "${AGENT_STOP_HOOK_TEST_FAILURE_OUTPUT:-simulated failure}" >&2
exit "${AGENT_STOP_HOOK_TEST_EXIT_CODE}"
EOF

chmod +x "$mock_make"

assert_contains() {
  local file_path="$1"
  local pattern="$2"
  if ! grep -F -- "$pattern" "$file_path" >/dev/null 2>&1; then
    echo "expected $file_path to contain: $pattern" >&2
    echo "actual contents:" >&2
    cat "$file_path" >&2
    exit 1
  fi
}

: >"$log_file"
AGENT_STOP_HOOK_TEST_LOG="$log_file" \
AGENT_STOP_HOOK_MAKE_BIN="$mock_make" \
"$hook_script" >"$stdout_file" 2>"$stderr_file"
assert_contains "$log_file" "-C $project_dir --no-print-directory stop-hook-unit-tests"
if [ -s "$stderr_file" ]; then
  echo "expected no stderr on success" >&2
  cat "$stderr_file" >&2
  exit 1
fi

: >"$log_file"
set +e
AGENT_STOP_HOOK_TEST_LOG="$log_file" \
AGENT_STOP_HOOK_TEST_EXIT_CODE=1 \
AGENT_STOP_HOOK_TEST_FAILURE_OUTPUT='backend tests failed' \
AGENT_STOP_HOOK_MAKE_BIN="$mock_make" \
"$hook_script" >"$stdout_file" 2>"$stderr_file"
status=$?
set -e
if [ "$status" -ne 2 ]; then
  echo "expected exit code 2 on failure, got $status" >&2
  exit 1
fi
assert_contains "$log_file" "-C $project_dir --no-print-directory stop-hook-unit-tests"
assert_contains "$stderr_file" 'Unit tests failed while running `stop-hook-unit-tests`.'
assert_contains "$stderr_file" 'Fix the failing tests before stopping.'
assert_contains "$stderr_file" 'backend tests failed'
