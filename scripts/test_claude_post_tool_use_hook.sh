#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hook_script="$project_dir/.claude/hooks/post-tool-use-format-and-lint.sh"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

log_file="$tmp_dir/make.log"
mock_make="$tmp_dir/mock-make.sh"

cat >"$mock_make" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$CLAUDE_HOOK_TEST_LOG"
EOF

chmod +x "$mock_make"

run_hook() {
  local payload="$1"
  printf '%s' "$payload" | \
    CLAUDE_PROJECT_DIR="$project_dir" \
    CLAUDE_HOOK_MAKE_BIN="$mock_make" \
    CLAUDE_HOOK_TEST_LOG="$log_file" \
    "$hook_script"
}

run_make_target() {
  local file_path="$1"
  CLAUDE_HOOK_TEST_LOG="$log_file" \
    make -C "$project_dir" --no-print-directory claude-post-tool-use FILE_PATH="$file_path" MAKE="$mock_make"
}

assert_contains() {
  local pattern="$1"
  if ! grep -F "$pattern" "$log_file" >/dev/null 2>&1; then
    echo "expected log to contain: $pattern" >&2
    echo "actual log:" >&2
    cat "$log_file" >&2
    exit 1
  fi
}

assert_log_lines() {
  local expected="$1"
  local actual
  actual="$(wc -l <"$log_file" | tr -d ' ')"
  if [ "$actual" != "$expected" ]; then
    echo "expected $expected log lines, got $actual" >&2
    cat "$log_file" >&2
    exit 1
  fi
}

: >"$log_file"
run_hook '{"tool_input":{"file_path":"'"$project_dir"'/backend/app/main.py"}}'
assert_log_lines 1
assert_contains 'claude-post-tool-use FILE_PATH=backend/app/main.py'

: >"$log_file"
run_make_target 'backend/app/main.py'
assert_log_lines 3
assert_contains 'lint-backend-fix BACKEND_PATH=app/main.py'
assert_contains 'format-backend BACKEND_PATH=app/main.py'
assert_contains 'lint-backend BACKEND_PATH=app/main.py'

: >"$log_file"
run_hook '{"tool_input":{"file_path":"frontend/src/app/page.tsx"}}'
assert_log_lines 1
assert_contains 'claude-post-tool-use FILE_PATH=frontend/src/app/page.tsx'

: >"$log_file"
run_make_target 'frontend/src/app/page.tsx'
assert_log_lines 2
assert_contains 'format-frontend FRONTEND_PATH=src/app/page.tsx'
assert_contains 'lint-frontend FRONTEND_PATH=src/app/page.tsx'

: >"$log_file"
run_hook '{"tool_input":{"file_path":"README.md"}}'
assert_log_lines 1
assert_contains 'claude-post-tool-use FILE_PATH=README.md'

: >"$log_file"
run_make_target 'terraform/main.tf'
assert_log_lines 1
assert_contains 'format-terraform TERRAFORM_PATH=main.tf'

: >"$log_file"
run_hook '{"tool_input":{"note":"missing path"}}'
assert_log_lines 0
