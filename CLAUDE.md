# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Mac Notes app clone web application with AI-powered features (summarization, Q&A) built with a full-stack serverless architecture. The frontend uses Next.js with App Router, and the backend uses FastAPI running in AWS Lambda Docker containers.

## Development Commands

### Local Development
```bash
# Start backend (FastAPI with uvicorn)
make dev-backend

# Start frontend (Next.js dev server)
make dev-frontend

# Run both (requires separate terminals)
make dev
```

### Testing
```bash
# All tests
make test

# Backend unit tests
make test-backend
cd backend && uv run pytest -v

# Frontend unit tests
make test-frontend
cd frontend && npm run test -- --run

# Integration tests (against deployed environment)
make test-integration ENV=dev

# E2E tests (Playwright)
make test-e2e ENV=dev
cd frontend && E2E_TARGET=dev npx playwright test

# Linting
make lint-backend  # Ruff
make lint-frontend # ESLint
```

### Database Migrations
```bash
# Create a new Alembic migration after schema changes
make db-revision MESSAGE="add_new_column"

# Apply all pending migrations
make db-upgrade

# Backend-local equivalents
cd backend && uv run alembic revision --autogenerate -m "add_new_column"
cd backend && uv run alembic upgrade head
```

### Deployment

**IMPORTANT: All deployment commands MUST be run from the project root directory.**

```bash
# Quick Lambda update (no Terraform, just function code)
make update-lambda ENV=dev

# Full deployment (builds and deploys both backend and frontend)
make deploy ENV=prd

# Terraform operations
make tf-init ENV=dev
make tf-plan ENV=dev
make tf-apply ENV=dev
make tf-fmt     # Format Terraform files
make tf-validate # Validate Terraform configuration

# View Lambda logs
make logs ENV=dev
```

## Architecture

### Frontend Structure
- **Next.js 16.1.0** with App Router (`src/app/`)
- **Radix UI** components for accessible primitives
- **Tailwind CSS v4** for styling
- **AWS Amplify** for Cognito authentication
- **Playwright** for E2E tests, **Vitest** for unit tests

### Backend Structure
- **FastAPI** with Python 3.12, running in Docker containers on AWS Lambda
- **SQLModel** (Pydantic + SQLAlchemy) with Aurora DSQL (PostgreSQL-compatible)
- **Mangum** adapter for Lambda integration
- **pytest** with async support for testing
- **Ruff** for linting

### Key Services
- `app/services/bedrock.py` - Bedrock AI service implementation
- `app/services/cache.py` - S3-based caching for AI responses
- `app/services/token_usage.py` - Token usage tracking with rate limiting
- `app/services/context.py` - User context management

### Authentication Flow
1. Users authenticate via Amazon Cognito (handled by frontend Amplify)
2. Backend verifies JWT tokens from Cognito
3. User identity extracted from `sub` claim
4. Resource ownership enforced via `user_id` field on all models

### Database Notes
- **Aurora DSQL** has limitations compared to standard PostgreSQL
- No foreign key constraints (DSQL compatibility)
- Manual UUIDs (no auto-increment)
- Soft deletes via timestamps
- User-based data isolation (all models have `user_id`)
- Schema changes must be managed with **Alembic** revisions, not ad hoc SQL in application startup code

### Terraform & AWS
- Uses **workspaces** for environment separation (dev/prd)
- Separate S3 backends per environment in `terraform/backends/`
- AWS profile matches environment name (`ENV=dev` uses `--profile dev`)
- Cognito for auth, DSQL for database, Lambda + API Gateway for backend, S3 + CloudFront for frontend

## Environment Configuration

### Backend (.env)
```
DATABASE_URL=postgresql://notes:notes@db:5432/notes
COGNITO_USER_POOL_ID=<your-pool-id>
COGNITO_APP_CLIENT_ID=<your-client-id>
BEDROCK_REGION=us-east-1
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ENVIRONMENT=dev
```

For E2E tests, also add:
```
E2E_TEST_USER_EMAIL=your-test-user@example.com
E2E_TEST_USER_PASSWORD=YourTestPassword123!
```

## Runtime Management

This project uses **mise** for runtime version management. All tool versions (Python, Node.js, etc.) are defined in the project root `mise.toml` file.

### mise Setup
```bash
# Install mise (if not already installed)
curl https://mise.run | sh

# Activate mise in your shell
eval "$(mise activate bash)"  # or zsh/fish
```

The required runtimes will be automatically installed when you enter the project directory.

## Important Patterns

- **mise runtime management**: Tool versions are managed via mise.toml at the project root
- **Terraform workspace switching**: The `tf-switch` Make target handles both backend config re-initialization and workspace selection
- **Container platform**: Backend Docker images must be built with `--platform linux/amd64` for Lambda compatibility
- **AI caching**: Responses are cached in S3 by hash to reduce Bedrock costs
- **Token tracking**: All AI calls track token usage for rate limiting and cost management
- **Pydantic v2**: Backend uses Pydantic v2 - be aware of syntax differences from v1
- **Async testing**: Backend tests use `pytest-asyncio` with `asyncio_mode=auto`

## Deployment Rules

**CRITICAL**: All deployment operations MUST use make commands exclusively. Never execute deployment commands directly.

**IMPORTANT**: When executing deployment commands with the Makefile, you must be in the repository root directory. The Makefile is located at the project root and deployment commands will fail from subdirectories.

### Allowed Commands (make only)
- `make deploy ENV=dev` or `make deploy ENV=prd` - Full deployment
- `make update-lambda ENV=dev` - Lambda-only code update
- `make tf-init ENV=dev`, `make tf-plan ENV=dev`, `make tf-apply ENV=dev` - Terraform operations

### Prohibited Commands (never use directly)
- Direct `aws` CLI commands (e.g., `aws lambda update-function-code`)
- Direct `terraform` CLI commands (e.g., `terraform apply`)
- Direct `docker build` or `docker push` commands
- Any direct deployment API calls or scripts

**When asked to deploy, always respond with the appropriate make command and ask for confirmation before executing.**

## Coding Rules

- Internationalization (i18n): Implement i18n for all user-facing text to ensure multi-language support.
- Testing Standards: Comprehensive unit and integration tests are required for all new features and bug fixes.
- Command Shortcuts: Define relevant command shortcuts in the root Makefile to streamline the development workflow.
