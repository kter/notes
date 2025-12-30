import { test, expect } from '@playwright/test';

test.describe('Mobile Comprehensive Scenario', () => {
  // Mobile testing requires isMobile to be true
  test.skip(({ isMobile }) => !isMobile, 'This test is only for mobile viewports');

  test('should navigate through sequential flow on mobile', async ({ page }) => {
    console.log('[Mobile Test] Starting mobile e2e sequence');
    await page.goto('/');

    // 1. Folders View - Create a folder
    console.log('[Mobile Test] Creating folder');
    await expect(page.getByRole('heading', { name: /Folders|フォルダ/i })).toBeVisible({ timeout: 25000 });
    await page.getByRole('button', { name: 'Add folder' }).click();
    
    const folderName = `Mobile Project ${Date.now()}`;
    await page.getByPlaceholder(/Folder name|フォルダ/i).fill(folderName);
    await page.keyboard.press('Enter');

    // 2. Select Folder
    console.log(`[Mobile Test] Selecting folder: ${folderName}`);
    await page.getByRole('button', { name: folderName }).click();
    // Verify transition to Notes view
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(folderName, 'i') })).toBeVisible({ timeout: 20000 });

    // 3. Create Note -> Auto transition to Editor View (fixed in code)
    console.log('[Mobile Test] Creating note');
    await page.getByRole('button', { name: 'Add note' }).click();
    
    const noteTitle = 'Mobile Note';
    const noteContent = 'Content created on a mobile device.';
    
    // Wait for editor view elements
    const titleInput = page.getByLabel(/Note title|タイトル/i);
    await expect(titleInput).toBeVisible({ timeout: 20000 });
    
    await titleInput.fill(noteTitle);
    await page.getByLabel(/Note content|ノートを入力/i).fill(noteContent);
    
    // Wait for auto-save
    await page.waitForTimeout(1000);
    const savedIndicator = page.locator('span').filter({ hasText: /Saved|保存しました/i });
    await expect(savedIndicator.first()).toBeVisible({ timeout: 35000 });

    // 4. Summarize -> Auto transition to Chat/Summary view
    console.log('[Mobile Test] Summarizing');
    await page.getByRole('button', { name: 'Summarize note' }).click();
    
    // Verify Summary is visible
    await expect(page.getByText(/Summary|要約/i).first()).toBeVisible({ timeout: 60000 });
    
    // 5. Navigation tests using bottom nav
    console.log('[Mobile Test] Testing bottom navigation');
    
    await page.getByRole('button', { name: 'View Folders' }).click();
    await expect(page.getByRole('heading', { name: /Folders|フォルダ/i })).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: 'View Notes' }).click();
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(folderName, 'i') })).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: 'View Editor' }).click();
    await expect(page.getByLabel(/Note title|タイトル/i)).toHaveValue(noteTitle, { timeout: 20000 });
  });
});
