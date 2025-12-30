import { test, expect, Page } from '@playwright/test';

// Reset storage state for auth tests - these need to test from unauthenticated state
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Navigate to login page with fallback.
 * Sometimes direct navigation to /login/ redirects back to home,
 * so we fall back to clicking the Sign In link.
 */
async function navigateToLogin(page: Page): Promise<void> {
  await page.goto('/login/');
  
  const emailInput = page.locator('#email');
  
  try {
    await emailInput.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    // Login form not found directly, try clicking Sign In button from home
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign In' }).first().click();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  }
}

test.describe('Authentication', () => {
  test('should login successfully', async ({ page }) => {
    await navigateToLogin(page);
    
    const email = process.env.E2E_TEST_USER_EMAIL;
    const password = process.env.E2E_TEST_USER_PASSWORD;

    if (!email || !password) {
      test.skip(true, 'Credentials not set in .env.local');
      return;
    }

    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Folders' })).toBeVisible();
  });

  test('should show error on failed login', async ({ page }) => {
    await navigateToLogin(page);

    await page.locator('#email').fill('wrong@example.com');
    await page.locator('#password').fill('WrongPassword123!');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // The error message comes from Cognito
    await expect(page.getByText(/Incorrect username or password|User does not exist/i)).toBeVisible();
  });
});

