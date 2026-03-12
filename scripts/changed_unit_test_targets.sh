#!/usr/bin/env bash

set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

collect_changed_files() {
  if [ -n "${CHANGED_UNIT_TEST_FILES:-}" ]; then
    printf '%s\n' "$CHANGED_UNIT_TEST_FILES"
    return 0
  fi

  cd "$project_dir"

  {
    git diff --name-only
    git diff --cached --name-only
    git ls-files --others --exclude-standard
  } | awk 'NF > 0' | sort -u
}

emit_target_once() {
  local target="$1"

  if [[ " ${seen_targets:-} " == *" $target "* ]]; then
    return 0
  fi

  seen_targets="${seen_targets:-} $target"
  printf '%s\n' "$target"
}

while IFS= read -r file_path; do
  [ -z "$file_path" ] && continue

  case "$file_path" in
    backend/*)
      emit_target_once "test-backend"
      ;;
    frontend/*)
      emit_target_once "test-frontend"
      ;;
    lambda/mcp_server/*)
      emit_target_once "test-mcp-lambda-unit"
      ;;
    lambda/auth_manager/*)
      emit_target_once "test-auth-manager-unit"
      ;;
  esac
done < <(collect_changed_files)
