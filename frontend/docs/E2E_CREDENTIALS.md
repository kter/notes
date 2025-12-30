# E2E Test Credential Management

Managing login credentials for E2E tests requires a balance of security, convenience, and reliability.

## 1. Local Development: `.env.local`

Avoid hardcoding credentials in test files. Use environment variables instead.

1. Create a `frontend/.env.local` (ensure it's in `.gitignore`).
2. Add your test credentials:
   ```env
   E2E_TEST_USER_EMAIL=test@example.com
   E2E_TEST_USER_PASSWORD=password123
   ```
3. Use them in your tests:
   ```typescript
   await page.getByLabel('Email').fill(process.env.E2E_TEST_USER_EMAIL!);
   await page.getByLabel('Password').fill(process.env.E2E_TEST_USER_PASSWORD!);
   ```

## 2. CI/CD: Secret Management

In CI environments (e.g., GitHub Actions), store credentials as **Secrets**.

- **GitHub Actions**: Settings -> Secrets and variables -> Actions -> New repository secret.
- **Accessing in CI**:
  ```yaml
  - name: Run Playwright tests
    run: npx playwright test
    env:
      E2E_TEST_USER_EMAIL: ${{ secrets.E2E_TEST_USER_EMAIL }}
      E2E_TEST_USER_PASSWORD: ${{ secrets.E2E_TEST_USER_PASSWORD }}
  ```

## 3. Playwright Efficiency: Auth State Reuse

Logging in for every single test is slow and can trigger rate limits. Playwright allows you to "reuse" the authentication state.

1. **Setup Authentication once**: Perform login in a "setup" project.
2. **Save to a file**: Save the cookies and local storage to a JSON file.
3. **Load in tests**: Configure following tests to use that state.

### Configuration Example (`playwright.config.ts`)

```typescript
export default defineConfig({
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
});
```

## 4. Best Practices Summary
- **Never commit secrets**: Check that `.env` files are ignored.
- **Dedicated Test Users**: Use accounts specifically created for E2E testing, not real user data.
- **Dynamic Values**: If possible, use accounts that can be reset or recreated via API calls before tests run.
