#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
TOKEN="${BYPASS_TOKEN:-local-dev-token}"

pass() { printf "  ok   %s\n" "$1"; }
fail() { printf "  FAIL %s\n" "$1" >&2; exit 1; }

echo "== Smoke: ${BASE_URL} =="

echo "[1] /health"
curl -fsS "${BASE_URL}/health" | grep -q '"status":"healthy"' || fail "/health"
pass "/health"

echo "[2] /openapi.json"
curl -fsS "${BASE_URL}/openapi.json" | grep -q '"openapi"' || fail "/openapi.json"
pass "/openapi.json"

AUTH="Authorization: Bearer ${TOKEN}"

echo "[3] GET /api/admin/me (bypass user should be admin)"
curl -fsS -H "${AUTH}" "${BASE_URL}/api/admin/me" | grep -q '"admin":true' || fail "/api/admin/me"
pass "/api/admin/me admin=true"

echo "[4] GET /api/folders"
curl -fsS -H "${AUTH}" "${BASE_URL}/api/folders" >/dev/null || fail "/api/folders"
pass "/api/folders"

echo "[5] GET /api/workspace/snapshot"
curl -fsS -H "${AUTH}" "${BASE_URL}/api/workspace/snapshot" >/dev/null || fail "/api/workspace/snapshot"
pass "/api/workspace/snapshot"

echo "[6] POST /api/notes (create then delete)"
NOTE_ID=$(curl -fsS -X POST -H "${AUTH}" -H 'Content-Type: application/json' \
  -d '{"title":"smoke-test","content":"hello"}' "${BASE_URL}/api/notes" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
curl -fsS -X DELETE -H "${AUTH}" "${BASE_URL}/api/notes/${NOTE_ID}" >/dev/null
pass "create/delete note id=${NOTE_ID}"

echo ""
echo "All smoke checks passed."
