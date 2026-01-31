---
description: Run E2E tests against dev or prd environment
---

1. Determine the target environment (dev or prd). If the user did not specify the environment, ask them to clarify whether they want to run against 'dev' or 'prd'.

2. Execute the tests from the repository root.

   If the environment is **dev**:
   ```bash
   make test-e2e-dev
   ```

   If the environment is **prd**:
   ```bash
   make test-e2e-prd
   ```

3. Review the test results.

4. If any tests fail, address the issues in the code.

5. Repeat the process until all tests pass.