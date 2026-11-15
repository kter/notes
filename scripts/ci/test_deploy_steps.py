"""Tests for scripts/ci/deploy_steps.sh with stubbed terraform/conftest.

Run: python3 -m unittest discover -s scripts/ci -p 'test_*.py'   (make test-ci-scripts)

The stubs print FAKE_SECRET on stdout and stderr, the way real Terraform
plan/apply output and conftest messages can. Nothing the script prints to the
(public) Actions log may contain it, whether the step succeeds or fails.
"""

from __future__ import annotations

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

    def test_cleanup_removes_plan_files(self) -> None:
        for name in ("tfplan", "tfplan.json", "plan.txt", "apply.txt"):
            (self.runner_temp / name).write_text(FAKE_SECRET, encoding="utf-8")
        result = self.run_step("cleanup")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(sorted(p.name for p in self.runner_temp.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
