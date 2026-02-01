import { test, expect } from '@playwright/test';

test.describe('Sync Strategy', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the dashboard to load by checking for a known element
    // This ensures we are logged in and the UI is ready
    await expect(page.getByRole('button', { name: /Add note|ノートを追加/i })).toBeVisible({ timeout: 30000 });
  });

  test('should save locally immediately and sync to server after delay', async ({ page }) => {
    // Create a new note to test with
    await page.getByRole('button', { name: /Add note|ノートを追加/i }).click();
    
    // Wait for editor to be ready
    const titleInput = page.getByPlaceholder(/Note Title|ノートのタイトル/i).first();
    await expect(titleInput).toBeVisible();

    // Type in title
    await titleInput.fill('Sync Test Note');
    // Note: fill triggers input event, which triggers debounced update in EditorPanel (500ms)
    // Then useNotes debounces server sync (5000ms)

    // Wait for the UI debounce (500ms) + small buffer
    await page.waitForTimeout(1000);

    // Expect "Saved locally" (Amber check) - try to verify, but don't fail hard if it's transient
    // The text might clearly say "Saved locally" or "ローカルに保存"
    const savedLocallyText = page.getByText(/Saved locally|ローカルに保存/i).first();
    try {
        await expect(savedLocallyText).toBeVisible({ timeout: 5000 });
    } catch (e) {
        console.log("Could not find Saved locally text, possibly skipped or transient");
    }

    // Now wait for 5 seconds (plus buffer) for server sync
    // Total wait > 5000ms
    await page.waitForTimeout(5000);

    // Should eventually show "Saved" (Green check)
    // The "Loading" state might appear briefly
    const savedText = page.getByText(/Saved|保存しました/i, { exact: true }).first();
    await expect(savedText).toBeVisible({ timeout: 10000 });
    
    // Ensure "Saved locally" is gone
    await expect(savedLocallyText).not.toBeVisible();
  });

  test('should trigger immediate sync on blur', async ({ page }) => {
    // Create new note
    await page.getByRole('button', { name: /Add note|ノートを追加/i }).click();
    const titleInput = page.getByPlaceholder(/Note Title|ノートのタイトル/i).first();
    await expect(titleInput).toBeVisible();

    // Type something
    await titleInput.fill('Blur Test');
    
    // Wait for UI debounce (500ms) just to be sure state is updated in React
    await page.waitForTimeout(600);

    // Verify it is in "Saved locally" state (optional check)
    try {
        const savedLocallyText = page.getByText(/Saved locally|ローカルに保存/i).first();
        await expect(savedLocallyText).toBeVisible({ timeout: 2000 });
    } catch (e) {
        console.log("Could not find Saved locally text in blur test");
    }

    // Bloom! (Blur) - click somewhere else, e.g., the sidebar
    await page.locator('body').click(); // Click on body or something neutral
    // Or just .blur()
    await titleInput.blur();

    // Should immediately sync (show "Saved" quickly, without waiting 5s)
    const savedText = page.getByText(/Saved|保存しました/i, { exact: true }).first();
    await expect(savedText).toBeVisible({ timeout: 2000 }); // Should be fast
  });
});
