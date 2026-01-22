import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page, baseURL }) => {
  console.log(`[E2E Setup] Starting authentication on: ${baseURL}`);

  // 1. Navigate to home first to ensure we have a clean state and proper base context
  console.log(`[E2E Setup] Navigating to /`);
  await page.goto('/');
  
  // 2. Head to login page. Try direct navigation first.
  // Using trailing slash as the snapshot suggests it's the preferred Next.js route
  console.log(`[E2E Setup] Navigating to /login/`);
  await page.goto('/login/');

  // 3. Fallback: If we don't see the email field, try clicking the Sign In button from home
  const emailInput = page.getByLabel('Email');
  try {
    // Wait briefly for the login form
    await emailInput.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    console.log(`[E2E Setup] Login form not found directly, trying to click 'Sign In' button...`);
    await page.goto('/');
    // There might be multiple Sign In buttons (header and hero), but any will do
    await page.getByRole('link', { name: 'Sign In' }).first().click();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  }

  // 4. Perform login
  const email = process.env.E2E_TEST_USER_EMAIL;
  const password = process.env.E2E_TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error('E2E_TEST_USER_EMAIL or E2E_TEST_USER_PASSWORD is not set in .env.local');
  }

  console.log(`[E2E Setup] Filling credentials for ${email}`);
  await emailInput.fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // 5. Wait for navigation to complete (logged in home page has no "Sign In" button or has specific headers)
  console.log(`[E2E Setup] Waiting for post-login navigation...`);
  await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
  
  // 6. Verify sidebar is visible as a sign of successful login
  // The sidebar has a "Folders" heading or a specific user-centric UI
  // Try to find either the heading or the All Notes button to confirm sidebar presence
  try {
    await expect(page.getByRole('heading', { name: /Folders|フォルダ|sidebar\.folders/i })).toBeVisible({ timeout: 5000 });
  } catch {
    console.log('[E2E Setup] Heading not found, checking for All Notes button...');
    await expect(page.getByText(/All Notes|すべてのノート|sidebar\.allNotes/i)).toBeVisible({ timeout: 10000 });
  }

  console.log(`[E2E Setup] Authentication successful!`);

  // End of authentication steps.
  await page.context().storageState({ path: authFile });
});
