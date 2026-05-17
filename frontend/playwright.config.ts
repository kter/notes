import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

/**
 * environment URL mapping
 */
const ENV_URLS = {
  local: 'http://localhost:3000',
  dev: 'https://notes.dev.devtools.site',
  prd: 'https://notes.devtools.site',
};

const targetEnv = (process.env.E2E_TARGET || 'local') as keyof typeof ENV_URLS;
const baseURL = ENV_URLS[targetEnv] || targetEnv; // Allow passing a raw URL

// In local mode, inject bypass flag so the frontend skips Cognito login
const isLocalBypass = targetEnv === 'local' || baseURL.includes('localhost');
if (isLocalBypass) {
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS = 'true';
  process.env.NEXT_PUBLIC_ENVIRONMENT = process.env.NEXT_PUBLIC_ENVIRONMENT || 'local';
  process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
}

console.log(`[E2E] Target Environment: ${targetEnv}`);
console.log(`[E2E] Base URL: ${baseURL}`);
console.log(`[E2E] Auth bypass: ${isLocalBypass}`);

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  timeout: targetEnv !== 'local' ? 60000 : 30000,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 1,
  /* Limit workers to avoid overwhelming the dev API under concurrent browser projects */
  workers: process.env.CI ? 1 : 2,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Accessibility-first best practice: headless is true by default */
    headless: true,
  },

  expect: {
    timeout: 15000,
  },

  /* Configure projects for major browsers */
  projects: [
    // In local bypass mode, skip the auth setup project — no login needed
    ...(isLocalBypass ? [] : [{ name: 'setup', testMatch: /.*\.setup\.ts/ }]),

    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(isLocalBypass ? {} : { storageState: 'playwright/.auth/user.json' }),
      },
      ...(isLocalBypass ? {} : { dependencies: ['setup'] }),
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        ...(isLocalBypass ? {} : { storageState: 'playwright/.auth/user.json' }),
      },
      ...(isLocalBypass ? {} : { dependencies: ['setup'] }),
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        ...(isLocalBypass ? {} : { storageState: 'playwright/.auth/user.json' }),
      },
      ...(isLocalBypass ? {} : { dependencies: ['setup'] }),
    },
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 12'],
        ...(isLocalBypass ? {} : { storageState: 'playwright/.auth/user.json' }),
      },
      ...(isLocalBypass ? {} : { dependencies: ['setup'] }),
    },
  ],

  /* Run your local dev server before starting the tests ONLY if targeting local */
  /* Note: in local mode the backend must already be running via `make dev-stack-backend` */
  webServer: isLocalBypass ? {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_DEV_AUTH_BYPASS: 'true',
      NEXT_PUBLIC_ENVIRONMENT: 'local',
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    },
  } : undefined,
});
