# Notes App Makefile
# Simplifies deployment and development tasks

# Configuration
ENV ?= dev

# Disable AWS CLI pager to prevent interactive pager from launching
export AWS_PAGER=

# Disable Terraform interactive input prompts
export TF_INPUT=0

# Use ENV as the default profile, but allow override from command line
# Using '=' instead of '?=' to override environment variables like 'export AWS_PROFILE=dev'
AWS_PROFILE = $(ENV)
AWS_REGION ?= ap-northeast-1

# Use deferred evaluation (=) so these are evaluated when used, picked up after profile/env is set
AWS_ACCOUNT_ID = $(shell aws sts get-caller-identity --profile $(AWS_PROFILE) --query Account --output text 2>/dev/null)
ECR_REPO = $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/notes-app-api-$(ENV)
MCP_SERVER_REPO = $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/notes-app-mcp-server-$(ENV)

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# =============================================================================
# Development
# =============================================================================

.PHONY: dev-backend
dev-backend: ## Run backend locally
	cd backend && uv run uvicorn app.main:app --reload --port 8000

.PHONY: dev-frontend
dev-frontend: ## Run frontend locally
	cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8000 NEXT_PUBLIC_ENVIRONMENT=dev npm run dev

.PHONY: dev
dev: ## Run both backend and frontend (requires tmux or run in separate terminals)
	@echo "Run in separate terminals:"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"

.PHONY: db-upgrade
db-upgrade: ## Apply backend database migrations locally
	cd backend && uv run alembic upgrade head

.PHONY: db-revision
db-revision: ## Create a new backend Alembic revision (MESSAGE="...")
	cd backend && uv run alembic revision --autogenerate -m "$(MESSAGE)"

# =============================================================================
# Backend Deployment
# =============================================================================

.PHONY: ecr-login
ecr-login: ## Login to ECR
	aws ecr get-login-password --region $(AWS_REGION) --profile $(AWS_PROFILE) | \
		docker login --username AWS --password-stdin $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com

.PHONY: build-backend
build-backend: ## Build backend Docker image
	cd backend && docker buildx build --provenance=false --load -t $(ECR_REPO):latest .

.PHONY: push-backend
push-backend: ecr-login build-backend ## Build and push backend Docker image to ECR
	docker push $(ECR_REPO):latest
	@echo "Image pushed: $(ECR_REPO):latest"
	$(eval DIGEST := $(shell docker inspect --format='{{.Id}}' $(ECR_REPO):latest | awk -F ':' '{print $$2}'))
	@echo "Backend digest: $(DIGEST)"

.PHONY: get-image-digest
get-image-digest: ## Get the latest image digest from ECR
	@aws ecr describe-images --repository-name notes-app-api-$(ENV) \
		--image-ids imageTag=latest \
		--profile $(AWS_PROFILE) \
		--query 'imageDetails[0].imageDigest' \
		--output text

.PHONY: deploy-backend
deploy-backend: tf-switch push-backend ## Build, push, and deploy backend via Terraform
	$(eval DIGEST := $(shell $(MAKE) get-image-digest ENV=$(ENV) AWS_PROFILE=$(AWS_PROFILE) --no-print-directory))
	cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform apply -var="lambda_image_tag=$(DIGEST)" -auto-approve
	@echo "Backend deployed!"

.PHONY: update-lambda
update-lambda: push-backend ## Update Lambda function code only (without Terraform)
	$(eval LAMBDA_NAME := notes-app-api-$(ENV))
	$(eval IMAGE_URI := $(shell aws ecr describe-repositories --repository-names $(LAMBDA_NAME) --profile $(AWS_PROFILE) --query 'repositories[0].repositoryUri' --output text):latest)
	aws lambda update-function-code \
		--function-name $(LAMBDA_NAME) \
		--image-uri $(IMAGE_URI) \
		--profile $(AWS_PROFILE)
	@echo "Lambda function $(LAMBDA_NAME) updated!"

# =============================================================================
# Frontend Deployment
# =============================================================================

.PHONY: build-frontend
build-frontend: tf-switch ## Build frontend for production
	$(eval API_URL := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw api_url))
	$(eval COGNITO_USER_POOL_ID := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw cognito_user_pool_id))
	$(eval COGNITO_CLIENT_ID := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw cognito_user_pool_client_id))
	cd frontend && NEXT_PUBLIC_API_URL=$(API_URL) NEXT_PUBLIC_ENVIRONMENT=$(ENV) NEXT_PUBLIC_COGNITO_USER_POOL_ID=$(COGNITO_USER_POOL_ID) NEXT_PUBLIC_COGNITO_CLIENT_ID=$(COGNITO_CLIENT_ID) npm run build


.PHONY: invalidate-cloudfront
invalidate-cloudfront: ## Create CloudFront cache invalidation
	$(eval CF_DIST := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw cloudfront_distribution_id))
	$(eval INVALIDATION_ID := $(shell aws cloudfront create-invalidation --distribution-id $(CF_DIST) --paths "/*" --profile $(AWS_PROFILE) --query 'Id' --output text))
	@echo "CloudFront invalidation created: $(INVALIDATION_ID)"
	@echo "Waiting for invalidation to complete..."
	@aws cloudfront wait invalidation-completed --id $(INVALIDATION_ID) --distribution-id $(CF_DIST) --profile $(AWS_PROFILE)
	@echo "CloudFront invalidation completed!"

.PHONY: deploy-frontend
deploy-frontend: build-frontend ## Build and deploy frontend to S3
	$(eval BUCKET := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw frontend_bucket_name))
	$(eval CF_DIST := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw cloudfront_distribution_id))
	@echo "Syncing frontend files to S3..."
	aws s3 sync frontend/out/ s3://$(BUCKET) --delete --profile $(AWS_PROFILE)
	@echo "Creating CloudFront cache invalidation..."
	aws cloudfront create-invalidation --distribution-id $(CF_DIST) --paths "/*" --profile $(AWS_PROFILE)
	@echo "Frontend deployed to $(BUCKET)"
	@echo "Note: CloudFront cache invalidation is in progress. Changes may take a few minutes to propagate."

# =============================================================================
# Full Deployment
# =============================================================================

.PHONY: deploy
deploy: ## Deploy both backend, frontend, and MCP, then run tests (optimized)
	@$(MAKE) --no-print-directory _deploy-setup ENV=$(ENV) AWS_PROFILE=$(AWS_PROFILE)
	@$(MAKE) --no-print-directory _deploy-backend ENV=$(ENV) AWS_PROFILE=$(AWS_PROFILE)
	@$(MAKE) --no-print-directory _deploy-frontend ENV=$(ENV) AWS_PROFILE=$(AWS_PROFILE)
	@$(MAKE) --no-print-directory _deploy-test ENV=$(ENV) AWS_PROFILE=$(AWS_PROFILE)
	@echo "Full deployment and verification complete!"

# =============================================================================
# Optimized Full Deployment Targets
# =============================================================================

.PHONY: _deploy-setup
_deploy-setup: tf-switch ## One-time setup (terraform init + workspace switch)

.PHONY: _deploy-backend
_deploy-backend: ## Build, push, and deploy all Lambda functions via Terraform (optimized)
	@$(MAKE) --no-print-directory -j2 push-backend push-mcp-server ENV=$(ENV) AWS_PROFILE=$(AWS_PROFILE)
	@DIGEST=$$($(MAKE) --no-print-directory get-image-digest ENV=$(ENV) AWS_PROFILE=$(AWS_PROFILE)); \
	MCP_SERVER_DIGEST=$$($(MAKE) --no-print-directory get-mcp-server-digest ENV=$(ENV) AWS_PROFILE=$(AWS_PROFILE)); \
	cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform apply -var="lambda_image_tag=$$DIGEST" -var="mcp_server_image_tag=$$MCP_SERVER_DIGEST" -auto-approve
	@echo "Backend and MCP server deployed!"

.PHONY: _deploy-frontend
_deploy-frontend: ## Build and deploy frontend to S3 (optimized)
	$(eval API_URL := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw api_url))
	$(eval COGNITO_USER_POOL_ID := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw cognito_user_pool_id))
	$(eval COGNITO_CLIENT_ID := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw cognito_user_pool_client_id))
	$(eval BUCKET := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw frontend_bucket_name))
	$(eval CF_DIST := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw cloudfront_distribution_id))
	@echo "Building frontend..."
	cd frontend && NEXT_PUBLIC_API_URL=$(API_URL) NEXT_PUBLIC_ENVIRONMENT=$(ENV) NEXT_PUBLIC_COGNITO_USER_POOL_ID=$(COGNITO_USER_POOL_ID) NEXT_PUBLIC_COGNITO_CLIENT_ID=$(COGNITO_CLIENT_ID) npm run build
	@echo "Syncing frontend files to S3..."
	aws s3 sync frontend/out/ s3://$(BUCKET) --delete --profile $(AWS_PROFILE)
	@echo "Creating CloudFront cache invalidation..."
	aws cloudfront create-invalidation --distribution-id $(CF_DIST) --paths "/*" --profile $(AWS_PROFILE)
	@echo "Frontend deployed to $(BUCKET)"
	@echo "Note: CloudFront cache invalidation is in progress. Changes may take a few minutes to propagate."

# _deploy-mcp is now merged into _deploy-backend above

.PHONY: _deploy-test
_deploy-test: ## Run post-deployment integration tests (dev only, uses already-initialized Terraform state)
ifeq ($(ENV),prd)
	@echo "Skipping integration tests in prd (backdoor auth not available)"
else
	$(eval API_URL := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw api_url))
	cd backend && API_URL=$(API_URL) uv run --extra dev python -m pytest tests/integration -v
endif

# =============================================================================
# Terraform
# =============================================================================

# Sentinel file tracking the last initialized Terraform environment (stored inside .terraform/ which is gitignored)
TF_SENTINEL := terraform/.terraform/.initialized_env

# Internal target to ensure terraform is initialized and workspace is selected for the correct environment.
# Skips `terraform init -reconfigure` if already initialized for the target ENV to speed up repeated calls.
.PHONY: tf-switch
tf-switch: ## Initialize backend and switch workspace based on ENV (dev/prd); skips re-init if already done
	@CURRENT=$$(cat $(TF_SENTINEL) 2>/dev/null || echo ""); \
	if [ "$$CURRENT" != "$(ENV)" ]; then \
		echo "Switching to $(ENV) environment (re-initializing Terraform backend)..."; \
		cd terraform && \
		export AWS_PROFILE=$(AWS_PROFILE) && \
		rm -f .terraform/environment && \
		terraform init -reconfigure -backend-config=backends/$(ENV).hcl && \
		(terraform workspace select $(ENV) || terraform workspace new $(ENV)) && \
		echo "$(ENV)" > .terraform/.initialized_env; \
	else \
		echo "Already initialized for $(ENV) environment, selecting workspace..."; \
		cd terraform && export AWS_PROFILE=$(AWS_PROFILE) && \
		(terraform workspace select $(ENV) || terraform workspace new $(ENV)); \
	fi

.PHONY: tf-init
tf-init: tf-switch ## Initialize Terraform for the current environment

.PHONY: tf-plan
tf-plan: tf-switch ## Run Terraform plan
	cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform plan

.PHONY: tf-apply
tf-apply: tf-switch ## Run Terraform apply
	cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform apply -auto-approve

.PHONY: tf-output
tf-output: tf-switch ## Show Terraform outputs
	cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output

.PHONY: tf-fmt
tf-fmt: ## Format Terraform configuration
	cd terraform && terraform fmt -recursive

.PHONY: tf-validate
tf-validate: ## Validate Terraform configuration
	cd terraform && terraform validate

# =============================================================================
# Utilities
# =============================================================================

.PHONY: logs
logs: ## Tail Lambda logs
	aws logs tail /aws/lambda/notes-app-api-$(ENV) --follow --profile $(AWS_PROFILE)

# =============================================================================
# Cost Report Lambda
# =============================================================================

.PHONY: update-cost-report
update-cost-report: tf-switch ## Update cost report Lambda function code
	cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform apply -target=aws_lambda_function.cost_report -auto-approve
	@echo "Cost report Lambda updated!"

.PHONY: test-cost-report
test-cost-report: tf-switch ## Manually invoke cost report Lambda
	aws lambda invoke --function-name $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw cost_report_lambda_name) \
		--profile $(AWS_PROFILE) \
		/tmp/cost-report-output.json
	@cat /tmp/cost-report-output.json
	@echo ""

.PHONY: clean
clean: ## Clean build artifacts
	rm -rf frontend/out frontend/.next
	rm -f $(TF_SENTINEL)
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# =============================================================================
# Testing
# =============================================================================

# Test command guide:
# - `make test` is the fastest day-to-day check: backend + frontend unit tests + lint.
# - `make test-unit` adds the MCP Lambda unit tests to the fast local suite.
# - `make test-all ENV=dev` runs the full validation suite: lint + unit + integration + E2E.
# - `make test-integration ENV=dev` hits the deployed backend in the selected environment.
# - `make test-e2e-host ENV=dev` runs browsers that work well on the host (Chromium family).
# - `make test-e2e-all ENV=dev` mirrors CI locally: host Chromium + Docker WebKit/Safari.
#
# Common overrides:
# - `ENV=dev|prd` selects the deployed environment for integration/E2E tests.
# - `TEST_ARGS='tests/auth.spec.ts'` or `TEST_ARGS='-g "full cycle"'` narrows Playwright runs.
# - `PROJECT=webkit` is required only for the generic Docker Playwright target.

.PHONY: test
test: test-backend test-frontend test-lint ## Run the default fast suite: backend + frontend unit tests + lint

.PHONY: test-unit
test-unit: test-backend test-frontend test-mcp-lambda-unit ## Run all unit tests across backend, frontend, and MCP Lambda

.PHONY: stop-hook-unit-tests
stop-hook-unit-tests: ## Run unit tests from Claude/Codex Stop hooks
	@$(MAKE) --no-print-directory test-unit

.PHONY: test-all
test-all: test-unit test-lint test-integration test-mcp-lambda-integration test-e2e-all ## Run the full suite: lint + unit + integration + E2E

.PHONY: test-mcp-lambda-unit
test-mcp-lambda-unit: ## Run MCP Lambda unit tests
	cd lambda/mcp_server && uv run --extra dev pytest tests/test_app_unit.py -q --tb=short

.PHONY: test-mcp-lambda-integration
test-mcp-lambda-integration: ## Run MCP Lambda integration tests (requires AWS/Cognito env vars)
	cd lambda/mcp_server && uv run --extra dev pytest tests/test_mcp_integration.py -v

.PHONY: test-backend
test-backend: ## Run backend unit/integration-free tests locally
	cd backend && uv run --extra dev python -m pytest -v

.PHONY: test-frontend
test-frontend: ## Run frontend Vitest unit tests
	cd frontend && npm run test -- --run

.PHONY: test-integration
test-integration: tf-switch ## Run backend integration tests against the deployed environment selected by ENV
	$(eval API_URL := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw api_url))
	cd backend && API_URL=$(API_URL) uv run --extra dev python -m pytest tests/integration -v

.PHONY: test-lint
test-lint: lint-backend lint-frontend ## Run all linters

.PHONY: test-claude-hooks
test-claude-hooks: ## Verify Claude Code hook routing
	./scripts/test_claude_post_tool_use_hook.sh
	./scripts/test_agent_hook_configs.sh --claude

.PHONY: test-stop-hooks
test-stop-hooks: ## Verify shared Stop hook behavior
	./scripts/test_agent_stop_hook.sh

.PHONY: test-codex-hooks
test-codex-hooks: ## Verify Codex hook routing
	./scripts/test_agent_hook_configs.sh --codex

.PHONY: test-agent-hooks
test-agent-hooks: test-claude-hooks test-stop-hooks test-codex-hooks ## Verify Claude Code and Codex hook routing

# Playwright browser split:
# - `chromium` and `Mobile Chrome` run directly on the host.
# - `webkit` and `Mobile Safari` run in Docker because Linux host WebKit/WPE is less stable
#   and can crash with messages like `WPEWebProcess quit unexpectedly`.
PLAYWRIGHT_DOCKER_IMAGE ?= mcr.microsoft.com/playwright:v1.57.0-noble
PLAYWRIGHT_DOCKER_RUN = docker run --rm --ipc=host -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$(CURDIR):/work" -w /work/frontend $(PLAYWRIGHT_DOCKER_IMAGE) bash -lc

BACKEND_PATH ?= .
FRONTEND_PATH ?= .
TERRAFORM_PATH ?= .

.PHONY: format
format: format-backend format-frontend format-terraform ## Run project auto-formatters

.PHONY: lint-backend-fix
lint-backend-fix: ## Run backend linter with auto-fixes (ruff --fix)
	cd backend && uv run ruff check --fix $(BACKEND_PATH)

.PHONY: format-backend
format-backend: ## Run backend formatter (ruff format)
	cd backend && uv run ruff format $(BACKEND_PATH)

.PHONY: lint-backend
lint-backend: ## Run backend linter (ruff)
	cd backend && uv run ruff check $(BACKEND_PATH)

.PHONY: format-frontend
format-frontend: ## Run frontend auto-fixes (eslint --fix)
	cd frontend && npm run lint -- --fix $(FRONTEND_PATH)

.PHONY: lint-frontend
lint-frontend: ## Run frontend linter (eslint)
	cd frontend && npm run lint -- $(FRONTEND_PATH)

.PHONY: format-terraform
format-terraform: ## Run Terraform formatter
	cd terraform && terraform fmt $(TERRAFORM_PATH)

.PHONY: claude-post-tool-use
claude-post-tool-use: ## Run hook-safe format/lint steps for a single edited file (FILE_PATH=...)
	@if [ -z "$(FILE_PATH)" ]; then \
		echo "FILE_PATH is required"; \
		exit 1; \
	fi
	@file_path="$(FILE_PATH)"; \
	case "$$file_path" in \
		backend/*.py) \
			rel_path="$${file_path#backend/}"; \
			$(MAKE) --no-print-directory lint-backend-fix BACKEND_PATH="$$rel_path" && \
			$(MAKE) --no-print-directory format-backend BACKEND_PATH="$$rel_path" && \
			$(MAKE) --no-print-directory lint-backend BACKEND_PATH="$$rel_path" ;; \
		frontend/*.js|frontend/*.jsx|frontend/*.ts|frontend/*.tsx|frontend/*.mjs|frontend/*.cjs) \
			rel_path="$${file_path#frontend/}"; \
			$(MAKE) --no-print-directory format-frontend FRONTEND_PATH="$$rel_path" && \
			$(MAKE) --no-print-directory lint-frontend FRONTEND_PATH="$$rel_path" ;; \
		terraform/*.tf|terraform/*.tfvars) \
			rel_path="$${file_path#terraform/}"; \
			$(MAKE) --no-print-directory format-terraform TERRAFORM_PATH="$$rel_path" ;; \
		*) \
			true ;; \
	esac

.PHONY: test-e2e
test-e2e: ## Run all Playwright projects on the host (use only if your host can run every browser)
	cd frontend && E2E_TARGET=$(ENV) npx playwright test $(TEST_ARGS)

.PHONY: test-e2e-dev
test-e2e-dev: ## Run E2E tests against dev environment
	cd frontend && E2E_TARGET=dev npx playwright test $(TEST_ARGS)

.PHONY: test-e2e-prd
test-e2e-prd: ## Run E2E tests against prd environment
	cd frontend && E2E_TARGET=prd npx playwright test $(TEST_ARGS)

.PHONY: test-e2e-host
test-e2e-host: ## Run the host-supported Playwright projects: chromium + Mobile Chrome
	cd frontend && E2E_TARGET=$(ENV) npx playwright test --project=chromium $(TEST_ARGS)
	cd frontend && E2E_TARGET=$(ENV) npx playwright test --project="Mobile Chrome" $(TEST_ARGS)

.PHONY: test-e2e-docker
test-e2e-docker: ## Run E2E tests in Docker (PROJECT required, ENV=dev|prd)
	$(if $(PROJECT),,$(error PROJECT is required, e.g. make test-e2e-docker PROJECT=webkit))
	$(PLAYWRIGHT_DOCKER_RUN) 'E2E_TARGET=$(ENV) npx playwright test --project="$(PROJECT)" $(TEST_ARGS)'

.PHONY: test-e2e-webkit-docker
test-e2e-webkit-docker: ## Run WebKit E2E tests in Docker
	$(PLAYWRIGHT_DOCKER_RUN) 'E2E_TARGET=$(ENV) npx playwright test --project=webkit $(TEST_ARGS)'

.PHONY: test-e2e-mobile-safari-docker
test-e2e-mobile-safari-docker: ## Run Mobile Safari E2E tests in Docker
	$(PLAYWRIGHT_DOCKER_RUN) 'E2E_TARGET=$(ENV) npx playwright test --project="Mobile Safari" $(TEST_ARGS)'

.PHONY: test-e2e-all
test-e2e-all: ## Run the CI-style Playwright split locally: host Chromium + Docker WebKit/Safari
	@$(MAKE) --no-print-directory test-e2e-host ENV=$(ENV) TEST_ARGS='$(TEST_ARGS)'
	@$(MAKE) --no-print-directory test-e2e-webkit-docker ENV=$(ENV) TEST_ARGS='$(TEST_ARGS)'
	@$(MAKE) --no-print-directory test-e2e-mobile-safari-docker ENV=$(ENV) TEST_ARGS='$(TEST_ARGS)'

.PHONY: install-playwright-deps
install-playwright-deps: ## Install host-side Playwright dependencies for Chromium (WebKit still uses Docker here)
	dnf install -y libicu libjpeg-turbo gstreamer1-plugins-base

.PHONY: install-hooks
install-hooks: ## Install git hooks via lefthook
	mise exec -- lefthook install
	@echo "Git hooks installed via lefthook."

# =============================================================================
# MCP Server Deployment
# =============================================================================

.PHONY: build-mcp-server
build-mcp-server: ## Build MCP server Docker image
	cd lambda/mcp_server && docker buildx build --provenance=false --load -t $(MCP_SERVER_REPO):latest .

.PHONY: push-mcp-server
push-mcp-server: ecr-login build-mcp-server ## Build and push MCP server Docker image to ECR
	docker push $(MCP_SERVER_REPO):latest
	@echo "MCP Server image pushed: $(MCP_SERVER_REPO):latest"
	$(eval MCP_SERVER_DIGEST := $(shell docker inspect --format='{{.Id}}' $(MCP_SERVER_REPO):latest | awk -F ':' '{print $$2}'))
	@echo "MCP Server digest: $(MCP_SERVER_DIGEST)"

.PHONY: get-mcp-server-digest
get-mcp-server-digest: ## Get the latest MCP server image digest from ECR
	@aws ecr describe-images --repository-name notes-app-mcp-server-$(ENV) \
		--image-ids imageTag=latest \
		--profile $(AWS_PROFILE) \
		--query 'imageDetails[0].imageDigest' \
		--output text

.PHONY: deploy-mcp
deploy-mcp: tf-switch push-mcp-server ## Deploy MCP infrastructure
	$(eval MCP_SERVER_DIGEST := $(shell $(MAKE) get-mcp-server-digest ENV=$(ENV) AWS_PROFILE=$(AWS_PROFILE) --no-print-directory))
	cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform apply \
		-var="mcp_server_image_tag=$(MCP_SERVER_DIGEST)" \
		-auto-approve
	@echo "MCP infrastructure deployed!"

.PHONY: mcp-logs
mcp-logs: ## Tail MCP server logs
	aws logs tail /aws/lambda/notes-app-mcp-server-$(ENV) --follow --profile $(AWS_PROFILE)

.PHONY: test-mcp-server
test-mcp-server: ## Test MCP server connection
	$(eval MCP_URL := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw mcp_server_api_url))
	@echo "MCP Server URL: $(MCP_URL)"
	@echo ""
	@echo "Health check:"
	@curl -s $(MCP_URL)/health | jq .
	@echo ""
	@echo "To test the MCP protocol, use a valid Cognito token:"
	@echo "curl -X POST -H 'Content-Type: application/json' -H 'Authorization: Bearer <TOKEN>' -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"resources/list\",\"params\":{}}' $(MCP_URL)/"
	@echo ""
	@echo "To configure Claude Desktop, add the following to your MCP config:"
	@echo '{"mcpServers": {"notes-app": {"url": "$(MCP_URL)/", "headers": {"Authorization": "Bearer <YOUR_COGNITO_TOKEN>"}}}}'
