#!/usr/bin/env bash
# Steps of .github/workflows/deploy.yml, kept here so the workflow stays short
# and the rules below live in one place.
#
#   deploy_steps.sh check-ci      main's CI workflow succeeded for GITHUB_SHA
#   deploy_steps.sh build-image   build + push backend as :git-<sha>, output digest
#   deploy_steps.sh tf-init       terraform init (S3 backend) + workspace select
#   deploy_steps.sh tf-plan       plan, conftest, values-free Job Summary
#   deploy_steps.sh tf-apply      apply the saved plan
#   deploy_steps.sh retag-latest  point ECR :latest at the deployed digest
#   deploy_steps.sh frontend      make _deploy-frontend with OIDC credentials
#   deploy_steps.sh cleanup       delete plan files and logs from RUNNER_TEMP
#
# Secrecy rules (the repository is public, Actions logs are public):
#   - Terraform plan/show/apply output can contain sensitive values in
#     plaintext (the dev integration bypass tokens). All Terraform output goes
#     to files under RUNNER_TEMP and is never printed, uploaded or summarized.
#   - On failure, print only a fixed message and the exit code.
#   - The Job Summary comes from scripts/ci/summarize_plan.py, which reads only
#     addresses and action names.
#   - conftest messages can quote attribute values; only counts are printed.
#   - No TF_LOG, no artifacts.
#
# Required env: DEPLOY_ENV (dev|prd), RUNNER_TEMP, GITHUB_SHA. Per step:
#   check-ci: GH_TOKEN, GITHUB_REPOSITORY
#   build-image: GITHUB_OUTPUT
#   tf-plan: IMAGE_DIGEST, GITHUB_STEP_SUMMARY
#   retag-latest: IMAGE_DIGEST

set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root" || exit 1

fail() {
  # $1 = step name, $2 = exit code. Never include command output here.
  echo "::error::deploy step '$1' failed (exit $2). Output withheld: it can contain secret values. Reproduce locally with the matching make target." >&2
  exit 1
}

require_env() {
  local name
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then
      echo "::error::missing required environment variable $name" >&2
      exit 1
    fi
  done
}

validate_env_name() {
  case "${DEPLOY_ENV:-}" in
    dev | prd) ;;
    *)
      echo "::error::DEPLOY_ENV must be dev or prd" >&2
      exit 1
      ;;
  esac
}

validate_digest() {
  if ! [[ "${IMAGE_DIGEST:-}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    echo "::error::IMAGE_DIGEST is not a sha256 digest" >&2
    exit 1
  fi
}

tf() {
  terraform -chdir=terraform "$@"
}

step_check_ci() {
  require_env GH_TOKEN GITHUB_REPOSITORY GITHUB_SHA
  local count
  if ! count="$(gh api \
    "repos/${GITHUB_REPOSITORY}/actions/workflows/ci.yml/runs?head_sha=${GITHUB_SHA}&branch=main&event=push&status=success&per_page=1" \
    --jq '.total_count' 2>/dev/null)"; then
    fail check-ci 1
  fi
  if ! [[ "$count" =~ ^[0-9]+$ ]] || [ "$count" -lt 1 ]; then
    echo "::error::CI (ci.yml) has not succeeded on main for ${GITHUB_SHA}. Wait for it, or fix main first." >&2
    exit 1
  fi
  echo "CI succeeded on main for ${GITHUB_SHA}."
}

step_build_image() {
  require_env GITHUB_SHA GITHUB_OUTPUT
  local tag="git-${GITHUB_SHA}"
  local digest
  # Build output is the public Dockerfile and source; safe to show.
  make --no-print-directory push-backend ENV="$DEPLOY_ENV" DEPLOY_CREDENTIALS=env IMAGE_TAG="$tag" ||
    fail build-image $?
  # The registry's manifest digest (not `docker inspect .Id`, which is the
  # config digest) is what Lambda pins.
  digest="$(make --no-print-directory get-image-digest ENV="$DEPLOY_ENV" DEPLOY_CREDENTIALS=env IMAGE_TAG="$tag")" ||
    fail get-image-digest $?
  IMAGE_DIGEST="$digest" validate_digest
  echo "image_digest=${digest}" >>"$GITHUB_OUTPUT"
  echo "Pushed notes-app-api-${DEPLOY_ENV}:${tag} (${digest})."
}

step_tf_init() {
  tf init -input=false -no-color -backend-config="backends/${DEPLOY_ENV}.hcl" \
    >"$RUNNER_TEMP/tf-init.log" 2>&1 || fail tf-init $?
  # select only: a missing workspace is a misconfiguration, not something to create.
  tf workspace select "$DEPLOY_ENV" \
    >>"$RUNNER_TEMP/tf-init.log" 2>&1 || fail tf-workspace-select $?
  echo "Terraform initialized for ${DEPLOY_ENV}."
}

step_tf_plan() {
  require_env GITHUB_STEP_SUMMARY
  validate_digest
  local plan="$RUNNER_TEMP/tfplan"
  local plan_json="$RUNNER_TEMP/tfplan.json"
  local plan_text="$RUNNER_TEMP/plan.txt"
  local counts="$RUNNER_TEMP/plan-counts"
  local rc

  tf plan -input=false -no-color -lock-timeout=5m \
    -var="lambda_image_tag=${IMAGE_DIGEST}" -out="$plan" \
    >"$plan_text" 2>&1 || fail tf-plan $?

  tf show -json "$plan" >"$plan_json" 2>"$RUNNER_TEMP/tf-show.err" || fail tf-show $?

  # Same policy run as `make tf-plan`, but JSON output to a file.
  conftest test "$plan_json" --policy terraform/policies/ --no-color --output json \
    >"$RUNNER_TEMP/conftest.json" 2>"$RUNNER_TEMP/conftest.err"
  rc=$?
  local failures warnings
  failures="$(jq '[.[].failures // [] | length] | add // 0' "$RUNNER_TEMP/conftest.json" 2>/dev/null)" || failures="?"
  warnings="$(jq '[.[].warnings // [] | length] | add // 0' "$RUNNER_TEMP/conftest.json" 2>/dev/null)" || warnings="?"
  echo "conftest: failures=${failures} warnings=${warnings} (messages withheld)"
  if [ "$rc" -ne 0 ]; then
    rm -f "$plan_json"
    echo "::error::conftest policy check failed (${failures} failure(s)). Run 'make tf-plan ENV=${DEPLOY_ENV}' locally to see the messages." >&2
    exit 1
  fi

  : >"$counts"
  python3 -I scripts/ci/summarize_plan.py "$plan_json" --plan-text "$plan_text" \
    --env "$DEPLOY_ENV" --outputs "$counts" \
    >"$RUNNER_TEMP/summary.md" 2>"$RUNNER_TEMP/summary.err"
  rc=$?
  rm -f "$plan_json"
  [ "$rc" -eq 0 ] || fail summarize-plan "$rc"
  cat "$RUNNER_TEMP/summary.md" >>"$GITHUB_STEP_SUMMARY"

  local data_loss
  data_loss="$(sed -n 's/^data_loss=\([0-9][0-9]*\)$/\1/p' "$counts")"
  if [ -z "$data_loss" ]; then
    fail plan-counts 1
  fi
  # No override input on purpose: whoever dispatches could set it, and the
  # approver approves before the plan exists. The owner deploys these locally.
  if [ "$data_loss" -gt 0 ]; then
    echo "::error::The plan replaces or deletes ${data_loss} data resource(s) (see the Job Summary). Not applying. The owner deploys this change from a workstation (docs/agents/deploy.md)." >&2
    exit 1
  fi
  echo "Plan ready (sha256 of plan.txt is in the Job Summary)."
}

step_tf_apply() {
  local plan="$RUNNER_TEMP/tfplan"
  [ -f "$plan" ] || fail tf-apply-missing-plan 1
  tf apply -input=false -no-color -lock-timeout=5m "$plan" \
    >"$RUNNER_TEMP/apply.txt" 2>&1 || fail tf-apply $?
  # The final line has a fixed format with counts only.
  grep -E '^Apply complete! Resources: [0-9]+ added, [0-9]+ changed, [0-9]+ destroyed\.$' \
    "$RUNNER_TEMP/apply.txt" || echo "Apply complete."
}

step_retag_latest() {
  validate_digest
  local repo="notes-app-api-${DEPLOY_ENV}"
  local image_json="$RUNNER_TEMP/ecr-image.json"
  local manifest="$RUNNER_TEMP/ecr-manifest.json"
  local media_type current err="$RUNNER_TEMP/ecr-put-image.err"

  aws ecr batch-get-image --repository-name "$repo" --image-ids "imageDigest=${IMAGE_DIGEST}" \
    --accepted-media-types \
    application/vnd.docker.distribution.manifest.v2+json \
    application/vnd.oci.image.manifest.v1+json \
    application/vnd.docker.distribution.manifest.list.v2+json \
    application/vnd.oci.image.index.v1+json \
    --output json >"$image_json" 2>/dev/null || fail retag-get-image $?
  # -j: no trailing newline. The file must hold the exact manifest bytes, or
  # it hashes to a different digest and put-image --image-digest rejects it.
  jq -ej '.images[0].imageManifest' "$image_json" >"$manifest" 2>/dev/null || fail retag-manifest 1
  if [ "sha256:$(sha256sum "$manifest" | cut -d' ' -f1)" != "$IMAGE_DIGEST" ]; then
    echo "::error::the manifest fetched from ECR does not hash to IMAGE_DIGEST" >&2
    exit 1
  fi
  media_type="$(jq -er '.images[0].imageManifestMediaType' "$image_json" 2>/dev/null)" || fail retag-media-type 1

  # put-image with the exact manifest bytes and media type keeps the digest.
  # --image-digest makes ECR reject the call if it would not.
  if ! aws ecr put-image --repository-name "$repo" --image-tag latest \
    --image-manifest "file://${manifest}" --image-manifest-media-type "$media_type" \
    --image-digest "$IMAGE_DIGEST" >/dev/null 2>"$err"; then
    if ! grep -q 'ImageAlreadyExistsException' "$err"; then
      fail retag-put-image 1
    fi
  fi

  current="$(make --no-print-directory get-image-digest ENV="$DEPLOY_ENV" DEPLOY_CREDENTIALS=env IMAGE_TAG=latest)" ||
    fail retag-verify $?
  if [ "$current" != "$IMAGE_DIGEST" ]; then
    echo "::error::ECR :latest does not point at the deployed digest after retagging" >&2
    exit 1
  fi
  echo "ECR ${repo}:latest -> ${IMAGE_DIGEST}"
}

step_frontend() {
  # Terraform outputs are read from the state initialized by tf-init. The
  # integration bypass tokens are NOT read: _deploy-test is never run in CI.
  make --no-print-directory _deploy-frontend ENV="$DEPLOY_ENV" DEPLOY_CREDENTIALS=env \
    >"$RUNNER_TEMP/frontend.log" 2>&1 || fail frontend $?
  echo "Frontend deployed for ${DEPLOY_ENV}."
}

step_cleanup() {
  rm -f "$RUNNER_TEMP"/tfplan "$RUNNER_TEMP"/tfplan.json "$RUNNER_TEMP"/plan.txt \
    "$RUNNER_TEMP"/apply.txt "$RUNNER_TEMP"/tf-*.log "$RUNNER_TEMP"/tf-*.err \
    "$RUNNER_TEMP"/conftest.* "$RUNNER_TEMP"/summary.* "$RUNNER_TEMP"/plan-counts \
    "$RUNNER_TEMP"/ecr-* "$RUNNER_TEMP"/frontend.log
}

main() {
  local step="${1:-}"
  validate_env_name
  require_env RUNNER_TEMP
  case "$step" in
    check-ci) step_check_ci ;;
    build-image) step_build_image ;;
    tf-init) step_tf_init ;;
    tf-plan) step_tf_plan ;;
    tf-apply) step_tf_apply ;;
    retag-latest) step_retag_latest ;;
    frontend) step_frontend ;;
    cleanup) step_cleanup ;;
    *)
      echo "usage: $0 check-ci|build-image|tf-init|tf-plan|tf-apply|retag-latest|frontend|cleanup" >&2
      exit 2
      ;;
  esac
}

main "$@"
