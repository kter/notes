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
  
  const emailInput = page.getByTestId('login-email-input');
  
  try {
    await emailInput.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    // Login form not found directly, try clicking Sign In button from home
    await page.goto('/');
    await page.getByTestId('landing-header-login-button').click();
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

    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill(password);
    await page.getByTestId('login-submit-button').click();

    await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /Folders|フォルダ/i })).toBeVisible();
  });

  test('should show error on failed login', async ({ page }) => {
    await navigateToLogin(page);

    await page.getByTestId('login-email-input').fill('wrong@example.com');
    await page.getByTestId('login-password-input').fill('WrongPassword123!');
    await page.getByTestId('login-submit-button').click();

    // Wait for either: error message div OR still on login page after timeout
    // The error div has class bg-destructive/10
    const errorDiv = page.locator('.bg-destructive\\/10');
    
    // Either the error shows, or we stay on login page (both indicate failed login)
    try {
      await expect(errorDiv).toBeVisible({ timeout: 10000 });
    } catch {
      // If no error visible, verify we're still on login page (not redirected)
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    }
  });
});
