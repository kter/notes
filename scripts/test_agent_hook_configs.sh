#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${1:-}"

if [ "$mode" != "--claude" ] && [ "$mode" != "--codex" ]; then
  echo "usage: $0 --claude|--codex" >&2
  exit 1
fi

if [ "$mode" = "--claude" ]; then
  jq -e '
    .hooks.PreToolUse[0].matcher == "Bash" and
    .hooks.PreToolUse[0].hooks[0].type == "command" and
    .hooks.PreToolUse[0].hooks[0].command == "$CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-use-block-destructive-commands.sh" and
    .hooks.Stop[0].hooks[0].type == "command" and
    .hooks.Stop[0].hooks[0].command == "$CLAUDE_PROJECT_DIR/scripts/agent_stop_hook_unit_tests.sh" and
    .hooks.PostToolUse[0].matcher == "Edit|MultiEdit|Write"
  ' "$project_dir/.claude/settings.json" >/dev/null
  exit 0
fi

jq -e '
  .hooks.Stop[0].hooks[0].type == "command" and
  .hooks.Stop[0].hooks[0].command == "./scripts/agent_stop_hook_unit_tests.sh" and
  .hooks.Stop[0].hooks[0].timeout == 1800 and
  .hooks.Stop[0].hooks[0].statusMessage == "Running unit tests before stopping"
' "$project_dir/.codex/hooks.json" >/dev/null

grep -Fx '[features]' "$project_dir/.codex/config.toml" >/dev/null
grep -Fx 'codex_hooks = true' "$project_dir/.codex/config.toml" >/dev/null
grep -Fx 'suppress_unstable_features_warning = true' "$project_dir/.codex/config.toml" >/dev/null
