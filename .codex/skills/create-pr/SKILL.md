---
name: create-pr
description: "Handle the full git workflow for completed code changes: review the diff, create a feature branch when needed, stage only relevant files, commit with a clear message, push to remote, create a pull request with `gh`, and ask the user to review. Use this skill when the user asks to commit, push, or open a PR, including requests like \"create a PR\", \"make a pull request\", \"プルリクエストを作って\", \"コミットして\", \"ブランチ作って\", or \"変更をプッシュして\". Also offer PR creation proactively after a substantial coding task."
---

# Create PR

Handle the full git workflow: branch, commit, push, pull request, and handoff to the user.

## When to use it

- The user asks to commit, push, create a branch, or open a pull request.
- A substantial coding task is complete and it is reasonable to offer a PR.

## Workflow

### 1. Inspect the current state

Run these in parallel:

```bash
git status
git diff
git log --oneline -5
```

Use the results to determine:

- what changed
- whether you are already on a feature branch
- whether any sensitive or unrelated files must stay out of the commit

If the working tree is clean, report that and stop.

### 2. Create a branch when needed

If you are already on a non-main branch, keep using it. Otherwise create a branch with this format:

```text
<type>/<short-kebab-description>
```

Types:

- `feature/` for new functionality
- `fix/` for bug fixes
- `refactor/` for internal restructuring
- `chore/` for tooling or maintenance
- `docs/` for documentation-only changes

Rules:

- lowercase letters, numbers, and hyphens only
- under 50 characters
- describe the outcome, not just the implementation detail

Example:

```bash
git switch -c fix/token-refresh-loop
```

### 3. Stage and commit carefully

Stage only the files that belong to the change. Do not use `git add .` or `git add -A`.

```bash
git add <file1> <file2> ...
```

Write a commit message that explains the change clearly:

```bash
git commit -m "$(cat <<'EOF'
<type>: <summary under 72 chars>

<optional body with context, motivation, or tradeoffs>
EOF
)"
```

Rules:

- never bypass hooks with `--no-verify`
- never stage secrets, credentials, or `.env` files
- if attribution is needed, follow the repository's existing convention rather than inventing one

### 4. Push the branch

```bash
git push -u origin <branch-name>
```

If there is no usable remote or push fails for another reason, explain the failure and stop. Do not force-push without explicit permission.

### 5. Open the pull request

Create the PR with `gh pr create`. Use the repository template if one exists; otherwise use a body like this and replace every placeholder with real content:

```bash
gh pr create --title "<concise PR title>" --body "$(cat <<'EOF'
## Summary

<1-3 sentences describing what changed and why>

## Changes

- <specific change>
- <specific change>

## Testing

- <how you verified the change>

## Notes

- <follow-up items, risks, or none>
EOF
)"
```

Guidance:

- `Summary` explains the problem and outcome in plain language
- `Changes` lists concrete implementation work
- `Testing` gives reviewer-usable verification steps
- `Notes` captures residual risk, follow-ups, or says none

### 6. Report back

After the PR is created, provide:

1. the PR URL
2. the branch name
3. the commit message summary
4. a short review request to the user

Example:

```text
PR: <url>
Branch: <branch-name>
Commit: <commit summary>

Review when ready.
```

## Edge cases

- Already on a feature branch: skip branch creation.
- Clean working tree: report it and stop.
- Hook failure: fix the issue, re-stage, and create a new commit without amending unless the user asked for it.
- Push rejection: diagnose it and avoid force-push unless the user explicitly approves.
- Sensitive files in the diff: warn the user and leave them unstaged.
