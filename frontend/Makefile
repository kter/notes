ENV ?= dev
PLAYWRIGHT_DOCKER_IMAGE ?= mcr.microsoft.com/playwright:v1.57.0-noble
PLAYWRIGHT_DOCKER_RUN = docker run --rm --ipc=host -u "$$(id -u):$$(id -g)" -e HOME=/tmp -v "$(CURDIR):/work/frontend" -w /work/frontend $(PLAYWRIGHT_DOCKER_IMAGE) bash -lc

.PHONY: test-e2e
test-e2e: ## Run E2E tests (default ENV=dev)
	E2E_TARGET=$(ENV) npx playwright test $(TEST_ARGS)

.PHONY: test-e2e-dev
test-e2e-dev: ## Run E2E tests against dev environment
	E2E_TARGET=dev npx playwright test $(TEST_ARGS)

.PHONY: test-e2e-prd
test-e2e-prd: ## Run E2E tests against prd environment
	E2E_TARGET=prd npx playwright test $(TEST_ARGS)

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
