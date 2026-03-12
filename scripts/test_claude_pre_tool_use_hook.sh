#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hook_script="$project_dir/.claude/hooks/pre-tool-use-block-destructive-commands.sh"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

log_file="$tmp_dir/make.log"
stdout_file="$tmp_dir/stdout.log"
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
    "$hook_script" >"$stdout_file"
}

run_make_target() {
  local command="$1"
  CLAUDE_HOOK_COMMAND="$command" \
    make -C "$project_dir" --no-print-directory claude-pre-tool-use >"$stdout_file"
}

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

assert_empty() {
  local file_path="$1"
  if [ -s "$file_path" ]; then
    echo "expected $file_path to be empty" >&2
    cat "$file_path" >&2
    exit 1
  fi
}

assert_denied() {
  local pattern="$1"
  jq -e --arg pattern "$pattern" '
    .hookSpecificOutput.hookEventName == "PreToolUse" and
    .hookSpecificOutput.permissionDecision == "deny" and
    (.hookSpecificOutput.permissionDecisionReason | contains($pattern))
  ' "$stdout_file" >/dev/null
}

: >"$log_file"
run_hook '{"tool_input":{"command":"rm -rf frontend/.next"}}'
assert_contains "$log_file" '-C '"$project_dir"' --no-print-directory claude-pre-tool-use'
assert_empty "$stdout_file"

run_make_target 'rm -rf frontend/.next'
assert_denied 'rm -rf'

run_make_target 'sudo rm -fr /tmp/notes'
assert_denied 'rm -rf'

run_make_target 'terraform destroy -auto-approve'
assert_denied 'terraform destroy'

run_make_target 'bash -lc '"'"'rm -rf terraform/.terraform'"'"''
assert_denied 'rm -rf'

run_make_target 'git reset --hard HEAD~1'
assert_denied 'git reset --hard'

run_make_target 'rm README.md'
assert_empty "$stdout_file"

run_make_target 'terraform plan'
assert_empty "$stdout_file"

CLAUDE_HOOK_COMMAND='' \
  make -C "$project_dir" --no-print-directory claude-pre-tool-use >"$stdout_file"
assert_empty "$stdout_file"
