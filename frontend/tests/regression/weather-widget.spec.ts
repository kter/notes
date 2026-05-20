import { test, expect } from '@playwright/test';

import { waitForWorkspaceSnapshotReady } from '../helpers/apiFixtures';

const CONSENT_KEY = 'weather-geolocation-consent';
const SNAPSHOT_WARMUP = { attempts: 12, delayMs: 5000, timeoutMs: 30000 };

async function openFirstNote(page: Parameters<typeof waitForWorkspaceSnapshotReady>[0]) {
  const desktopLayout = page.getByTestId('desktop-layout');
  const firstNote = desktopLayout.locator('[data-testid^="note-list-item-"]').first();
  await expect(firstNote).toBeVisible({ timeout: 30000 });
  await firstNote.click();
  await expect(desktopLayout.getByTestId('editor-title-input')).toBeVisible({ timeout: 15000 });
}

test.describe('Regression: WeatherWidget geolocation consent', () => {
  test('shows consent chip on first load and grants consent on Allow click', async ({ page, isMobile, browserName }) => {
    test.skip(isMobile, 'Desktop only — WeatherWidget lives in the editor status bar');
    test.skip(browserName === 'webkit', 'Flaky on WebKit');
    test.setTimeout(120000);

    await page.goto('/');
    await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Ensure consent is not set, then reload so the component sees the cleared state
    await page.evaluate((key) => localStorage.removeItem(key), CONSENT_KEY);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Open a note so the EditorStatusBar (which hosts WeatherWidget) is visible
    await openFirstNote(page);

    // Scope to desktop layout to avoid strict mode violation (mobile layout renders the same widget)
    const desktopLayout = page.getByTestId('desktop-layout');

    // Consent chip should appear in the status bar
    const chip = desktopLayout.getByTestId('weather-consent-chip');
    await expect(chip).toBeVisible({ timeout: 15000 });

    // Hover chip to open tooltip (Radix Tooltip opens on mouseenter)
    await chip.hover();

    // Allow button should appear inside tooltip
    const allowButton = page.getByTestId('weather-consent-allow').first();
    await expect(allowButton).toBeVisible({ timeout: 10000 });

    // Tooltip should show privacy explanation
    await expect(page.getByText('Location is used for weather data and never stored.').first()).toBeVisible({ timeout: 5000 });

    // Click Allow — consent is stored and geolocation starts
    await allowButton.click();

    // Consent should be persisted in localStorage
    const stored = await page.evaluate((key) => localStorage.getItem(key), CONSENT_KEY);
    expect(stored).toBe('granted');

    // Consent chip should disappear after granting
    await expect(chip).not.toBeVisible({ timeout: 10000 });
  });

  test('skips consent UI on reload when consent already stored', async ({ page, isMobile, browserName }) => {
    test.skip(isMobile, 'Desktop only — WeatherWidget lives in the editor status bar');
    test.skip(browserName === 'webkit', 'Flaky on WebKit');
    test.setTimeout(120000);

    await page.goto('/');
    await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Pre-set consent, then reload
    await page.evaluate((key) => localStorage.setItem(key, 'granted'), CONSENT_KEY);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Open a note so the EditorStatusBar is rendered
    await openFirstNote(page);

    // Scope to desktop layout to avoid strict mode violation
    const desktopLayout = page.getByTestId('desktop-layout');

    // Consent chip must NOT appear
    const chip = desktopLayout.getByTestId('weather-consent-chip');
    await expect(chip).not.toBeVisible({ timeout: 10000 });

    // Cleanup: remove consent so other test runs start fresh
    await page.evaluate((key) => localStorage.removeItem(key), CONSENT_KEY);
  });
});
