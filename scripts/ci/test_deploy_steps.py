"""Tests for scripts/ci/deploy_steps.sh with stubbed terraform/conftest.

Run: python3 -m unittest discover -s scripts/ci -p 'test_*.py'   (make test-ci-scripts)

The stubs print FAKE_SECRET on stdout and stderr, the way real Terraform
plan/apply output and conftest messages can. Nothing the script prints to the
(public) Actions log may contain it, whether the step succeeds or fails.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "deploy_steps.sh"
FIXTURE = HERE / "testdata" / "plan_with_secret.json"
FAKE_SECRET = "FAKE-SECRET-d0n0tleak-9f8e7d"
DIGEST = "sha256:" + "a" * 64

TERRAFORM_STUB = f"""#!/usr/bin/env bash
# args: -chdir=terraform <subcommand> ...
shift
sub="$1"; shift
# `show -json` writes only JSON to stdout; everything else is chatty.
[ "$sub" = show ] || echo "terraform $sub output with {FAKE_SECRET}"
echo "terraform $sub error with {FAKE_SECRET}" >&2
case "$sub" in
  plan)
    [ "${{STUB_PLAN_FAIL:-}}" = 1 ] && exit 1
    for a in "$@"; do case "$a" in -out=*) echo binary > "${{a#-out=}}" ;; esac; done
    ;;
  show)
    cat "$STUB_PLAN_JSON"
    ;;
  apply)
    [ "${{STUB_APPLY_FAIL:-}}" = 1 ] && exit 1
    echo "Apply complete! Resources: 1 added, 2 changed, 0 destroyed."
    ;;
  init|workspace)
    [ "${{STUB_INIT_FAIL:-}}" = 1 ] && exit 1
    ;;
esac
exit 0
"""

CONFTEST_STUB = f"""#!/usr/bin/env bash
if [ "${{STUB_CONFTEST_FAIL:-}}" = 1 ]; then
  echo '[{{"filename":"x","namespace":"main","successes":3,"failures":[{{"msg":"[S3] bucket {FAKE_SECRET}"}}],"warnings":[]}}]'
  echo "conftest error {FAKE_SECRET}" >&2
  exit 1
fi
echo '[{{"filename":"x","namespace":"main","successes":3,"failures":[],"warnings":[{{"msg":"warn {FAKE_SECRET}"}}]}}]'
exit 0
"""


AWS_STUB = """#!/usr/bin/env bash
echo "aws $*" >> "$STUB_DIR/calls"
case "$1 $2" in
  "ecr batch-get-image") cat "$STUB_DIR/batch-get-image.json" ;;
  "ecr put-image")
    for a in "$@"; do case "$a" in file://*) cp "${a#file://}" "$STUB_DIR/put-manifest" ;; esac; done
    if [ "${STUB_PUT_EXISTS:-}" = 1 ]; then
      echo "An error occurred (ImageAlreadyExistsException) when calling the PutImage operation" >&2
      exit 254
    fi
    ;;
  "ecr describe-images") echo "$STUB_DESCRIBE_DIGEST" ;;
  "ecr get-login-password") echo password ;;
  "sts get-caller-identity") echo 123456789012 ;;
  *) echo "unexpected aws call: $*" >&2; exit 1 ;;
esac
"""

DOCKER_STUB = """#!/usr/bin/env bash
echo "docker $*" >> "$STUB_DIR/calls"
case "$1" in
  inspect) echo "sha256:configdigest" ;;
esac
exit 0
"""

GH_STUB = """#!/usr/bin/env bash
echo "gh $*" >> "$STUB_DIR/calls"
[ "${STUB_GH_FAIL:-}" = 1 ] && { echo "HTTP 403 with details" >&2; exit 1; }
echo "${STUB_GH_COUNT:-0}"
"""


def write_exe(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


@unittest.skipUnless(shutil.which("jq") and shutil.which("bash"), "needs bash and jq")
class DeployStepsTest(unittest.TestCase):
    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.bin = self.tmp / "bin"
        self.bin.mkdir()
        self.runner_temp = self.tmp / "runner"
        self.runner_temp.mkdir()
        self.summary = self.tmp / "summary.md"
        self.summary.touch()
        write_exe(self.bin / "terraform", TERRAFORM_STUB)
        write_exe(self.bin / "conftest", CONFTEST_STUB)
        write_exe(self.bin / "aws", AWS_STUB)
        write_exe(self.bin / "docker", DOCKER_STUB)
        write_exe(self.bin / "gh", GH_STUB)
        self.stub_dir = self.tmp / "stub"
        self.stub_dir.mkdir()
        self.github_output = self.tmp / "github_output"
        self.github_output.touch()

    def run_step(self, step: str, **extra: str) -> subprocess.CompletedProcess[str]:
        env = {
            "PATH": f"{self.bin}{os.pathsep}{os.environ['PATH']}",
            "HOME": str(self.tmp),
            "DEPLOY_ENV": "dev",
            "RUNNER_TEMP": str(self.runner_temp),
            "GITHUB_SHA": "0" * 40,
            "GITHUB_STEP_SUMMARY": str(self.summary),
            "IMAGE_DIGEST": DIGEST,
            "STUB_PLAN_JSON": str(FIXTURE),
            "ALLOW_DATA_LOSS": "true",
            "STUB_DIR": str(self.stub_dir),
            "GITHUB_OUTPUT": str(self.github_output),
            "GITHUB_REPOSITORY": "kter/notes",
            "GH_TOKEN": "dummy",
        }
        env.update(extra)
        return subprocess.run(
            ["bash", str(SCRIPT), step], capture_output=True, text=True, env=env, check=False
        )

    def assert_no_secret(self, result: subprocess.CompletedProcess[str]) -> None:
        self.assertNotIn(FAKE_SECRET, result.stdout)
        self.assertNotIn(FAKE_SECRET, result.stderr)
        self.assertNotIn(FAKE_SECRET, self.summary.read_text(encoding="utf-8"))

    def test_plan_success_prints_counts_only(self) -> None:
        result = self.run_step("tf-plan")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_no_secret(result)
        self.assertIn("conftest: failures=0 warnings=1", result.stdout)
        self.assertIn("### Terraform plan (dev)", self.summary.read_text(encoding="utf-8"))
        # The plan JSON is deleted as soon as it has been summarized.
        self.assertFalse((self.runner_temp / "tfplan.json").exists())
        self.assertTrue((self.runner_temp / "tfplan").exists())

    def test_plan_failure_withholds_output(self) -> None:
        result = self.run_step("tf-plan", STUB_PLAN_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assert_no_secret(result)
        self.assertIn("deploy step 'tf-plan' failed", result.stderr)

    def test_conftest_failure_withholds_messages(self) -> None:
        result = self.run_step("tf-plan", STUB_CONFTEST_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assert_no_secret(result)
        self.assertIn("conftest: failures=1", result.stdout)
        self.assertFalse((self.runner_temp / "tfplan.json").exists())

    def test_data_loss_blocks_unless_allowed(self) -> None:
        result = self.run_step("tf-plan", ALLOW_DATA_LOSS="false")
        self.assertNotEqual(result.returncode, 0)
        self.assert_no_secret(result)
        self.assertIn("replaces or deletes 2 data resource(s)", result.stderr)

    def test_invalid_digest_is_rejected_before_terraform(self) -> None:
        result = self.run_step("tf-plan", IMAGE_DIGEST="latest")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("IMAGE_DIGEST is not a sha256 digest", result.stderr)
        self.assertFalse((self.runner_temp / "plan.txt").exists())

    def test_invalid_env_is_rejected(self) -> None:
        result = self.run_step("tf-init", DEPLOY_ENV="staging")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DEPLOY_ENV must be dev or prd", result.stderr)

    def test_init_failure_withholds_output(self) -> None:
        result = self.run_step("tf-init", STUB_INIT_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assert_no_secret(result)

    def test_apply_prints_only_the_fixed_format_result_line(self) -> None:
        (self.runner_temp / "tfplan").write_text("binary", encoding="utf-8")
        result = self.run_step("tf-apply")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assert_no_secret(result)
        self.assertIn("Apply complete! Resources: 1 added, 2 changed, 0 destroyed.", result.stdout)

    def test_apply_failure_withholds_output(self) -> None:
        (self.runner_temp / "tfplan").write_text("binary", encoding="utf-8")
        result = self.run_step("tf-apply", STUB_APPLY_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assert_no_secret(result)

    # --- retag-latest -------------------------------------------------------

    def prepare_manifest(self) -> str:
        manifest = '{"schemaVersion":2,"mediaType":"application/vnd.docker.distribution.manifest.v2+json"}'
        digest = "sha256:" + hashlib.sha256(manifest.encode()).hexdigest()
        (self.stub_dir / "batch-get-image.json").write_text(
            json.dumps(
                {
                    "images": [
                        {
                            "imageManifest": manifest,
                            "imageManifestMediaType": "application/vnd.docker.distribution.manifest.v2+json",
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        return digest

    def test_retag_puts_the_exact_manifest_bytes(self) -> None:
        digest = self.prepare_manifest()
        result = self.run_step("retag-latest", IMAGE_DIGEST=digest, STUB_DESCRIBE_DIGEST=digest)
        self.assertEqual(result.returncode, 0, result.stderr)
        put = (self.stub_dir / "put-manifest").read_bytes()
        self.assertEqual("sha256:" + hashlib.sha256(put).hexdigest(), digest)
        calls = (self.stub_dir / "calls").read_text(encoding="utf-8")
        self.assertIn("--image-tag latest", calls)
        self.assertIn(f"--image-digest {digest}", calls)
        self.assertIn("--image-ids imageTag=latest", calls)
        self.assertNotIn("--profile", calls)

    def test_retag_accepts_latest_already_at_digest(self) -> None:
        digest = self.prepare_manifest()
        result = self.run_step(
            "retag-latest", IMAGE_DIGEST=digest, STUB_DESCRIBE_DIGEST=digest, STUB_PUT_EXISTS="1"
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_retag_fails_when_latest_does_not_move(self) -> None:
        digest = self.prepare_manifest()
        result = self.run_step("retag-latest", IMAGE_DIGEST=digest, STUB_DESCRIBE_DIGEST=DIGEST)
        self.assertNotEqual(result.returncode, 0)

    def test_retag_refuses_a_manifest_with_another_digest(self) -> None:
        self.prepare_manifest()
        result = self.run_step("retag-latest", IMAGE_DIGEST=DIGEST, STUB_DESCRIBE_DIGEST=DIGEST)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not hash to IMAGE_DIGEST", result.stderr)
        self.assertFalse((self.stub_dir / "put-manifest").exists())

    # --- build-image ---------------------------------------------------------

    def test_build_image_pushes_git_sha_tag_and_outputs_registry_digest(self) -> None:
        result = self.run_step("build-image", STUB_DESCRIBE_DIGEST=DIGEST)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self.github_output.read_text(encoding="utf-8").splitlines(), [f"image_digest={DIGEST}"]
        )
        calls = (self.stub_dir / "calls").read_text(encoding="utf-8")
        tag = "notes-app-api-dev:git-" + "0" * 40
        self.assertIn(f"docker push 123456789012.dkr.ecr.ap-northeast-1.amazonaws.com/{tag}", calls)
        self.assertIn("--image-ids imageTag=git-" + "0" * 40, calls)
        self.assertNotIn(":latest", calls)
        self.assertNotIn("--profile", calls)

    def test_build_image_rejects_a_non_digest(self) -> None:
        result = self.run_step("build-image", STUB_DESCRIBE_DIGEST="None")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.github_output.read_text(encoding="utf-8"), "")

    # --- check-ci --------------------------------------------------------------

    def test_check_ci_passes_with_a_successful_run(self) -> None:
        result = self.run_step("check-ci", STUB_GH_COUNT="1")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = (self.stub_dir / "calls").read_text(encoding="utf-8")
        self.assertIn("actions/workflows/ci.yml/runs?head_sha=" + "0" * 40, calls)
        self.assertIn("status=success", calls)

    def test_check_ci_fails_without_a_successful_run(self) -> None:
        result = self.run_step("check-ci", STUB_GH_COUNT="0")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("has not succeeded on main", result.stderr)

    def test_check_ci_api_failure_prints_fixed_message(self) -> None:
        result = self.run_step("check-ci", STUB_GH_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("HTTP 403 with details", result.stderr)

    def test_cleanup_removes_plan_files(self) -> None:
        for name in ("tfplan", "tfplan.json", "plan.txt", "apply.txt"):
            (self.runner_temp / name).write_text(FAKE_SECRET, encoding="utf-8")
        result = self.run_step("cleanup")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(sorted(p.name for p in self.runner_temp.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
