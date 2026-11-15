# AGENTS.md

## Scope

Instructions for the entire repository.

More specific instructions may exist in nested `AGENTS.md` files. When instructions conflict, the nearer file takes precedence.

## Overview

This repository is a Mac Notes app clone with AI-powered features built on a serverless stack.
- `frontend/`: Next.js App Router
- `backend/`: FastAPI on AWS Lambda Docker
- `terraform/`: AWS infrastructure

## Shared Rules

- The root `Makefile` is the canonical entry point for project commands.
- Use the tool versions defined in `mise.toml`.
- Implement i18n for all user-facing text.
- Add or update tests for every new feature and bug fix.
- Add reusable workflow shortcuts to the root `Makefile`.
- Run cross-stack workflows, deployment, and Terraform operations from the repository root.
- Use root `make` targets for project workflows. Do not run direct `aws`, `terraform apply`, `docker build`, or `docker push` deployment commands.
- Deploys from GitHub Actions use `.github/workflows/deploy.yml` (see `docs/agents/deploy.md`). Agents may start one with `gh api -X POST repos/kter/notes/actions/workflows/deploy.yml/dispatches -f ref=main -f 'inputs[env]=dev' -f 'inputs[target]=all'` and report the run URL. Never approve it: do not call the `pending_deployments` or review APIs. Codex Cloud cannot dispatch; hand the deploy back to a human.

## Common Commands

```bash
make dev          # prints local dev startup options
make dev-stack    # one command: backend + frontend with auth bypass against dev DSQL
                  # (requires the AWS dev profile and `make tf-init ENV=dev`)
make test
make install-hooks
make deploy ENV=prd
make tf-plan ENV=dev
```

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `kter/notes`, operated via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, unchanged (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root plus `docs/adr/`. See `docs/agents/domain.md`.
