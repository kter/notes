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

## Common Commands

```bash
make dev
make test
make install-hooks
make deploy ENV=prd
make tf-plan ENV=dev
```
