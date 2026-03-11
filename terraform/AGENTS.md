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
