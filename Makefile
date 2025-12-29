# Notes App Makefile
# Simplifies deployment and development tasks

# Configuration
ENV ?= dev

# Use ENV as the default profile, but allow override from command line
# Using '=' instead of '?=' to override environment variables like 'export AWS_PROFILE=dev'
AWS_PROFILE = $(ENV)
AWS_REGION ?= ap-northeast-1

# Use deferred evaluation (=) so these are evaluated when used, picked up after profile/env is set
AWS_ACCOUNT_ID = $(shell aws sts get-caller-identity --profile $(AWS_PROFILE) --query Account --output text 2>/dev/null)
ECR_REPO = $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/notes-app-api-$(ENV)

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

# =============================================================================
# Backend Deployment
# =============================================================================

.PHONY: ecr-login
ecr-login: ## Login to ECR
	aws ecr get-login-password --region $(AWS_REGION) --profile $(AWS_PROFILE) | \
		docker login --username AWS --password-stdin $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com

.PHONY: build-backend
build-backend: ## Build backend Docker image
	cd backend && docker build --platform linux/amd64 -t $(ECR_REPO):latest .

.PHONY: push-backend
push-backend: ecr-login build-backend ## Build and push backend Docker image to ECR
	docker push $(ECR_REPO):latest
	@echo "Image pushed: $(ECR_REPO):latest"

.PHONY: get-image-digest
get-image-digest: ## Get the latest image digest from ECR
	@aws ecr describe-images --repository-name notes-app-api-$(ENV) \
		--image-ids imageTag=latest \
		--profile $(AWS_PROFILE) \
		--query 'imageDetails[0].imageDigest' \
		--output text

.PHONY: deploy-backend
deploy-backend: push-backend ## Build, push, and deploy backend via Terraform
	cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform apply -auto-approve
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
build-frontend: ## Build frontend for production
	$(eval API_URL := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw api_url))
	$(eval COGNITO_USER_POOL_ID := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw cognito_user_pool_id))
	$(eval COGNITO_CLIENT_ID := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw cognito_user_pool_client_id))
	cd frontend && NEXT_PUBLIC_API_URL=$(API_URL) NEXT_PUBLIC_ENVIRONMENT=$(ENV) NEXT_PUBLIC_COGNITO_USER_POOL_ID=$(COGNITO_USER_POOL_ID) NEXT_PUBLIC_COGNITO_CLIENT_ID=$(COGNITO_CLIENT_ID) npm run build


.PHONY: deploy-frontend
deploy-frontend: build-frontend ## Build and deploy frontend to S3
	$(eval BUCKET := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw frontend_bucket_name))
	$(eval CF_DIST := $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw cloudfront_distribution_id))
	aws s3 sync frontend/out/ s3://$(BUCKET) --delete --profile $(AWS_PROFILE)
	aws cloudfront create-invalidation --distribution-id $(CF_DIST) --paths "/*" --profile $(AWS_PROFILE)
	@echo "Frontend deployed to $(BUCKET)"

# =============================================================================
# Full Deployment
# =============================================================================

.PHONY: deploy
deploy: deploy-backend deploy-frontend ## Deploy both backend and frontend
	@echo "Full deployment complete!"

# =============================================================================
# Terraform
# =============================================================================

# Internal target to ensure terraform is initialized and workspace is selected for the correct environment
.PHONY: tf-switch
tf-switch: ## Re-initialize backend and switch workspace based on ENV (dev/prd)
	@echo "Switching to $(ENV) environment..."
	cd terraform && \
	AWS_PROFILE=$(AWS_PROFILE) terraform init -reconfigure -backend-config=backends/$(ENV).hcl && \
	(terraform workspace select $(ENV) || terraform workspace new $(ENV))

.PHONY: tf-init
tf-init: tf-switch ## Initialize Terraform for the current environment

.PHONY: tf-plan
tf-plan: tf-switch ## Run Terraform plan
	cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform plan

.PHONY: tf-apply
tf-apply: tf-switch ## Run Terraform apply
	cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform apply

.PHONY: tf-output
tf-output: tf-switch ## Show Terraform outputs
	cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output

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
update-cost-report: ## Update cost report Lambda function code
	cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform apply -target=aws_lambda_function.cost_report -auto-approve
	@echo "Cost report Lambda updated!"

.PHONY: test-cost-report
test-cost-report: ## Manually invoke cost report Lambda
	aws lambda invoke --function-name $(shell cd terraform && AWS_PROFILE=$(AWS_PROFILE) terraform output -raw cost_report_lambda_name) \
		--profile $(AWS_PROFILE) \
		/tmp/cost-report-output.json
	@cat /tmp/cost-report-output.json
	@echo ""

.PHONY: clean
clean: ## Clean build artifacts
	rm -rf frontend/out frontend/.next
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# =============================================================================
# Testing
# =============================================================================

.PHONY: test
test: test-backend test-lint ## Run all tests

.PHONY: test-backend
test-backend: ## Run backend tests
	cd backend && uv run python -m pytest -v

.PHONY: test-lint
test-lint: lint-backend lint-frontend ## Run all linters

.PHONY: lint-backend
lint-backend: ## Run backend linter (ruff)
	cd backend && uv run ruff check .

.PHONY: lint-frontend
lint-frontend: ## Run frontend linter (eslint)
	cd frontend && npm run lint

.PHONY: install-hooks
install-hooks: ## Install git pre-commit hooks
	chmod +x scripts/pre-commit
	cp scripts/pre-commit .git/hooks/pre-commit
	@echo "Pre-commit hook installed!"

