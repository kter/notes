ENV ?= dev

.PHONY: test-e2e
test-e2e: ## Run E2E tests (default ENV=dev)
	E2E_TARGET=$(ENV) npx playwright test

.PHONY: test-e2e-dev
test-e2e-dev: ## Run E2E tests against dev environment
	E2E_TARGET=dev npx playwright test

.PHONY: test-e2e-prd
test-e2e-prd: ## Run E2E tests against prd environment
	E2E_TARGET=prd npx playwright test
