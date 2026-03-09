# Test Generation

`playwright-cli` emits Playwright actions that can be turned into test code.

## Suggested workflow

```bash
playwright-cli open https://example.com/login
playwright-cli snapshot
playwright-cli fill e1 "user@example.com"
playwright-cli fill e2 "password123"
playwright-cli click e3
```

Collect the generated actions and wrap them in a test:

```typescript
import { test, expect } from '@playwright/test';

test('login flow', async ({ page }) => {
  await page.goto('https://example.com/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('password123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/dashboard/);
});
```

## Rules

- inspect the snapshot before recording actions
- prefer semantic locators from generated output
- add assertions manually
