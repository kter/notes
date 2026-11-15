# AGENTS.md

## Scope

Instructions for work under `terraform/`.

Inherit the repository-level guidance from the parent `AGENTS.md`. When Terraform-specific guidance conflicts with parent guidance, this file takes precedence.

## Command Policy

- Use the root `Makefile` as the canonical entry point.
- Common entry points: `make tf-init ENV=dev`, `make tf-plan ENV=dev`, `make tf-apply ENV=dev`, `make tf-output ENV=dev`, `make tf-fmt`, `make tf-validate`.
- Run Terraform workflows from the repository root.

## Terraform Notes

- Use Terraform workspaces for environment separation (`dev`, `prd`).
- Backend configs live in `terraform/backends/`.
- `ENV` maps to the AWS profile.
- `tf-switch` handles backend reinitialization and workspace selection.
- Use root `make` targets for Terraform and deployment workflows; do not run direct deployment commands.
- `providers.tf` uses the profile named after the workspace unless `use_workspace_profile=false`; only the GitHub Actions deploy workflow sets that (OIDC credentials from the environment). Keep local targets on profiles.
- `ci-bootstrap/` is a separate root for the GitHub Actions OIDC roles (`notes-gha-plan-<env>`, `notes-gha-deploy-<env>`). The owner applies it locally with `make ci-bootstrap-plan ENV=...` then `make ci-bootstrap-apply ENV=...`; CI only validates it (`make ci-bootstrap-validate`). First-time setup steps (OIDC provider check, GitHub environments, `AWS_ROLE_ARN`) are in `docs/agents/deploy.md`.
- `terraform show -json` output contains sensitive values in plaintext. Never print, upload or summarize it; see `scripts/ci/summarize_plan.py` for the values-free summary.
