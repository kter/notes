import { test, expect } from '@playwright/test';

import { waitForWorkspaceSnapshotReady } from '../helpers/apiFixtures';

const SNAPSHOT_WARMUP = { attempts: 12, delayMs: 5000, timeoutMs: 30000 };

async function openSettings(page: Parameters<typeof waitForWorkspaceSnapshotReady>[0], isMobile: boolean) {
  if (isMobile) {
    await page.getByTestId('mobile-nav-folders').click();
    await expect(page.getByTestId('mobile-layout-folders')).toBeVisible();
  }
  const container = isMobile
    ? page.getByTestId('mobile-layout-folders')
    : page.getByTestId('desktop-layout');
  const settingsButton = container.locator('button[title="Settings"]').first();
  await expect(settingsButton).toBeVisible({ timeout: 15000 });
  await settingsButton.click();
}

test.describe('Regression: Settings', () => {
  test('should display all expected controls', async ({ page, isMobile, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(60000);

    await page.goto('/');
    await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await openSettings(page, isMobile);

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /^Settings$|^設定$/i })).toBeVisible({ timeout: 10000 });
    // #language-select and #model-select are the Radix SelectTrigger <button> elements
    await expect(dialog.locator('#language-select')).toBeVisible();
    await expect(dialog.locator('#model-select')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Download ZIP|ZIPをダウンロード/i })).toBeVisible();
    await expect(dialog.locator('#api-key-name')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });

  test('should switch language and persist after save', async ({ page, isMobile, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(90000);

    await page.goto('/');
    await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await openSettings(page, isMobile);
    const dialog = page.getByRole('dialog');

    // #language-select is the Radix SelectTrigger <button>
    const langTrigger = dialog.locator('#language-select');
    await expect(langTrigger).toBeVisible({ timeout: 10000 });
    const currentText = await langTrigger.textContent() ?? '';
    const switchToJa = !/日本語/.test(currentText);

    // Ensure the model selector has a valid selection by picking the first available model
    // (dev environment may have restricted model IDs that differ from what was previously saved)
    const modelTrigger = dialog.locator('#model-select');
    await modelTrigger.click();
    await page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[role="option"]').first().click();

    // Open the language dropdown and pick the target language
    await langTrigger.click();
    if (switchToJa) {
      await page.getByRole('option', { name: /日本語/i }).first().click();
      await expect(langTrigger).toContainText('日本語', { timeout: 5000 });
    } else {
      await page.getByRole('option', { name: /English/i }).first().click();
      await expect(langTrigger).toContainText('English', { timeout: 5000 });
    }

    // Save
    const saveResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/settings') && resp.request().method() === 'PUT',
      { timeout: 20000 }
    );
    await dialog.getByRole('button', { name: /Save|保存/i }).click();
    const savedResp = await saveResponse;
    const respBody = await savedResp.text().catch(() => '');
    expect(savedResp.status(), `PUT /api/settings returned ${savedResp.status()}\nResponse: ${respBody}`).toBeLessThan(400);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // Reload and verify language persisted
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await openSettings(page, isMobile);
    const dialogAfter = page.getByRole('dialog');
    const langTriggerAfter = dialogAfter.locator('#language-select');
    await expect(langTriggerAfter).toBeVisible({ timeout: 10000 });
    const newText = await langTriggerAfter.textContent() ?? '';

    if (switchToJa) {
      expect(newText).toMatch(/日本語/);
    } else {
      expect(newText).toMatch(/English/);
    }

    // Revert to original language to avoid polluting the shared dev account
    await langTriggerAfter.click();
    if (switchToJa) {
      await page.getByRole('option', { name: /English/i }).first().click();
    } else {
      await page.getByRole('option', { name: /日本語/i }).first().click();
    }
    const revertResponse = page.waitForResponse(
      (resp) => resp.url().includes('/api/settings') && resp.request().method() === 'PUT',
      { timeout: 20000 }
    );
    await dialogAfter.getByRole('button', { name: /Save|保存/i }).click();
    await revertResponse;
    await page.keyboard.press('Escape');
  });
});
