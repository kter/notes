#!/usr/bin/env python3
"""Write a values-free Markdown summary of a Terraform plan.

Used by .github/workflows/deploy.yml for the GitHub Job Summary. The plan
JSON (`terraform show -json`) contains every attribute value in plaintext,
including sensitive ones (the dev integration bypass tokens), and the repo is
public. So this script reads ONLY, per resource change:

    address, type, mode, change.actions

and never `before`, `after`, `*_sensitive`, `planned_values`, `prior_state`,
`variables`, `configuration` or `output_changes`. Addresses are safe to print:
Terraform rejects sensitive values as count/for_each keys.

On any error it prints a fixed message (never the exception text or input)
and exits non-zero.

Usage:
    summarize_plan.py PLAN_JSON --plan-text PLAN_TXT [--env ENV] [--outputs FILE]

--outputs FILE appends `key=<integer>` lines (GITHUB_OUTPUT format).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from typing import Iterable

# Resource types whose replacement or deletion loses data.
DATA_RESOURCE_TYPES = frozenset(
    {
        "aws_s3_bucket",
        "aws_cognito_user_pool",
        "aws_ssm_parameter",
        "aws_dynamodb_table",
    }
)
DATA_RESOURCE_PREFIXES = ("aws_dsql_",)
IAM_PREFIX = "aws_iam_"

KNOWN_ACTIONS = frozenset({"no-op", "create", "read", "update", "delete"})

FAILURE_MESSAGE = "summarize_plan: could not summarize the plan (details withheld)"


class PlanFormatError(Exception):
    """The plan JSON did not have the expected shape."""


def classify(actions: list[str]) -> str:
    """Map Terraform's action list to one label."""
    if sorted(actions) == ["create", "delete"]:
        return "replace"
    if len(actions) == 1 and actions[0] in KNOWN_ACTIONS:
        return actions[0]
    raise PlanFormatError


def is_data_resource(resource_type: str) -> bool:
    return resource_type in DATA_RESOURCE_TYPES or resource_type.startswith(
        DATA_RESOURCE_PREFIXES
    )


def extract_changes(plan: object) -> list[tuple[str, str, str]]:
    """Return (address, type, label) for each managed resource change."""
    if not isinstance(plan, dict):
        raise PlanFormatError
    raw = plan.get("resource_changes", [])
    if not isinstance(raw, list):
        raise PlanFormatError

    changes = []
    for rc in raw:
        if not isinstance(rc, dict):
            raise PlanFormatError
        address = rc.get("address")
        resource_type = rc.get("type")
        mode = rc.get("mode", "managed")
        change = rc.get("change")
        if not isinstance(address, str) or not isinstance(resource_type, str):
            raise PlanFormatError
        if not isinstance(change, dict):
            raise PlanFormatError
        actions = change.get("actions")
        if not isinstance(actions, list) or not all(isinstance(a, str) for a in actions):
            raise PlanFormatError
        if mode != "managed":
            continue
        changes.append((address, resource_type, classify(actions)))
    return changes


def md_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("|", "\\|").replace("`", "'")


def render(
    changes: Iterable[tuple[str, str, str]],
    plan_text_sha256: str,
    env: str,
) -> tuple[str, dict[str, int]]:
    changes = list(changes)
    counts = Counter(label for _, _, label in changes)
    listed = [c for c in changes if c[2] not in ("no-op", "read")]
    iam = [c for c in listed if c[1].startswith(IAM_PREFIX)]
    data_loss = [c for c in listed if c[2] in ("replace", "delete") and is_data_resource(c[1])]

    lines = [f"### Terraform plan ({md_escape(env)})", ""]
    lines.append(
        "create: {create} / update: {update} / replace: {replace} / "
        "delete: {delete} / unchanged: {noop}".format(
            create=counts["create"],
            update=counts["update"],
            replace=counts["replace"],
            delete=counts["delete"],
            noop=counts["no-op"],
        )
    )
    lines.append("")
    lines.append(f"plan.txt sha256: `{plan_text_sha256}`")
    lines.append("")

    if data_loss:
        lines.append(f"**WARNING: {len(data_loss)} data resource(s) would be replaced or deleted:**")
        lines.append("")
        for address, _, label in data_loss:
            lines.append(f"- `{md_escape(address)}` ({label})")
        lines.append("")
    if iam:
        lines.append(f"**NOTE: {len(iam)} IAM resource change(s):**")
        lines.append("")
        for address, _, label in iam:
            lines.append(f"- `{md_escape(address)}` ({label})")
        lines.append("")

    if listed:
        lines.append("| address | action |")
        lines.append("| --- | --- |")
        for address, _, label in listed:
            lines.append(f"| `{md_escape(address)}` | {label} |")
    else:
        lines.append("No resource changes.")
    lines.append("")

    outputs = {
        "changes": len(listed),
        "iam_changes": len(iam),
        "data_loss": len(data_loss),
    }
    return "\n".join(lines), outputs


def sha256_of(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(65536), b""):
            digest.update(block)
    return digest.hexdigest()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("plan_json")
    parser.add_argument("--plan-text", required=True)
    parser.add_argument("--env", default="unknown")
    parser.add_argument("--outputs")
    try:
        args = parser.parse_args(argv)
    except SystemExit:
        print(FAILURE_MESSAGE, file=sys.stderr)
        return 2

    try:
        with open(args.plan_json, encoding="utf-8") as fh:
            plan = json.load(fh)
        changes = extract_changes(plan)
        text, outputs = render(changes, sha256_of(args.plan_text), args.env)
        if args.outputs:
            with open(args.outputs, "a", encoding="utf-8") as fh:
                for key, value in outputs.items():
                    fh.write(f"{key}={int(value)}\n")
    except Exception:  # noqa: BLE001 - never echo exception text; it may quote input
        print(FAILURE_MESSAGE, file=sys.stderr)
        return 1

    sys.stdout.write(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
