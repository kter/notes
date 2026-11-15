"""Tests for scripts/ci/summarize_plan.py.

Run: python3 -m unittest discover -s scripts/ci -p 'test_*.py'   (make test-ci-scripts)

The fixture plants FAKE_SECRET in every part of a plan JSON that carries
values (before/after, planned_values, prior_state, variables, configuration,
output_changes). The summary must never contain it.
"""

from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "summarize_plan.py"
FIXTURE = HERE / "testdata" / "plan_with_secret.json"
FAKE_SECRET = "FAKE-SECRET-d0n0tleak-9f8e7d"


def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-I", str(SCRIPT), *args],
        capture_output=True,
        text=True,
        check=False,
    )


class SummarizePlanTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.plan_text = Path(self.tmp.name) / "plan.txt"
        # plan.txt itself may contain values; only its hash is printed.
        self.plan_text.write_text(f"plan output mentioning {FAKE_SECRET}\n", encoding="utf-8")
        self.outputs = Path(self.tmp.name) / "github_output"

    def test_fixture_really_contains_the_secret(self) -> None:
        self.assertIn(FAKE_SECRET, FIXTURE.read_text(encoding="utf-8"))

    def test_summary_never_contains_secret_values(self) -> None:
        result = run(str(FIXTURE), "--plan-text", str(self.plan_text), "--env", "dev",
                     "--outputs", str(self.outputs))
        self.assertEqual(result.returncode, 0, "summary failed")
        self.assertNotIn(FAKE_SECRET, result.stdout)
        self.assertNotIn(FAKE_SECRET, result.stderr)
        self.assertNotIn(FAKE_SECRET, self.outputs.read_text(encoding="utf-8"))

    def test_counts_actions_and_addresses(self) -> None:
        result = run(str(FIXTURE), "--plan-text", str(self.plan_text), "--env", "dev")
        out = result.stdout
        self.assertIn("### Terraform plan (dev)", out)
        self.assertIn("create: 1 / update: 2 / replace: 1 / delete: 1 / unchanged: 2", out)
        self.assertIn("| `aws_lambda_function.api` | update |", out)
        self.assertIn("| `aws_ssm_parameter.integration_test_bypass_token[0]` | replace |", out)
        # no-op and data-source reads are counted but not listed
        self.assertNotIn("| `random_password.integration_test_bypass_token[0]`", out)
        self.assertNotIn("data.aws_caller_identity.current", out)

    def test_flags_iam_and_data_loss(self) -> None:
        result = run(str(FIXTURE), "--plan-text", str(self.plan_text), "--outputs", str(self.outputs))
        out = result.stdout
        self.assertIn("WARNING: 2 data resource(s) would be replaced or deleted", out)
        self.assertIn("- `aws_s3_bucket.images` (delete)", out)
        self.assertIn("- `aws_ssm_parameter.integration_test_bypass_token[0]` (replace)", out)
        # update of a data resource is not data loss
        self.assertNotIn("- `aws_cognito_user_pool.main`", out)
        self.assertIn("NOTE: 1 IAM resource change(s)", out)
        self.assertEqual(
            self.outputs.read_text(encoding="utf-8").splitlines(),
            ["changes=5", "iam_changes=1", "data_loss=2"],
        )

    def test_prints_plan_text_hash(self) -> None:
        expected = hashlib.sha256(self.plan_text.read_bytes()).hexdigest()
        result = run(str(FIXTURE), "--plan-text", str(self.plan_text))
        self.assertIn(f"plan.txt sha256: `{expected}`", result.stdout)

    def test_empty_plan(self) -> None:
        empty = Path(self.tmp.name) / "empty.json"
        empty.write_text('{"format_version": "1.2"}', encoding="utf-8")
        result = run(str(empty), "--plan-text", str(self.plan_text), "--outputs", str(self.outputs))
        self.assertEqual(result.returncode, 0)
        self.assertIn("No resource changes.", result.stdout)
        self.assertIn("data_loss=0", self.outputs.read_text(encoding="utf-8"))

    def assert_fails_without_leaking(self, content: str) -> None:
        bad = Path(self.tmp.name) / "bad.json"
        bad.write_text(content, encoding="utf-8")
        result = run(str(bad), "--plan-text", str(self.plan_text))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertNotIn(FAKE_SECRET, result.stderr)
        self.assertIn("details withheld", result.stderr)

    def test_malformed_json_fails_without_leaking(self) -> None:
        self.assert_fails_without_leaking('{"variables": {"x": "' + FAKE_SECRET + '"')

    def test_unexpected_shape_fails_without_leaking(self) -> None:
        self.assert_fails_without_leaking(
            '{"resource_changes": [{"address": "a.b", "type": "aws_x", '
            '"change": {"actions": ["' + FAKE_SECRET + '"]}}]}'
        )

    def test_missing_plan_file_fails_without_traceback(self) -> None:
        result = run(os.path.join(self.tmp.name, "missing.json"), "--plan-text", str(self.plan_text))
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
