import { test, expect } from '@playwright/test';

test.describe('Mobile Comprehensive Scenario', () => {
  // Mobile testing requires isMobile to be true
  test.skip(({ isMobile }) => !isMobile, 'This test is only for mobile viewports');

  // TODO: Fix this test - AI summary selector and timing issues
  test.skip('should navigate through sequential flow on mobile', async ({ page }) => {
    console.log('[Mobile Test] Starting mobile e2e sequence');
    await page.goto('/');

    // 1. Folders View - Create a folder
    console.log('[Mobile Test] Creating folder');
    await expect(page.getByRole('heading', { name: /Folders|フォルダ/i })).toBeVisible({ timeout: 25000 });
    await page.getByRole('button', { name: /Add folder|フォルダを追加/i }).click();
    
    const folderName = `Mobile Project ${Date.now()}`;
    await page.getByPlaceholder(/Folder name|フォルダ名/i).fill(folderName);
    await page.keyboard.press('Enter');

    // 2. Select Folder
    console.log(`[Mobile Test] Selecting folder: ${folderName}`);
    await page.getByRole('button', { name: folderName }).click();
    // Verify transition to Notes view
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(folderName, 'i') })).toBeVisible({ timeout: 20000 });

    // 3. Create Note -> Auto transition to Editor View (fixed in code)
    console.log('[Mobile Test] Creating note');
    await page.getByRole('button', { name: /Add note|ノートを追加/i }).click();
    
    const noteTitle = 'Mobile Note';
    const noteContent = 'Content created on a mobile device.';
    
    // Wait for editor view elements using placeholder patterns
    // Use locator that filters for visible elements
    const titleInput = page.getByPlaceholder(/Note title|ノートのタイトル/i).first();
    await expect(titleInput).toBeVisible({ timeout: 20000 });
    
    await titleInput.fill(noteTitle);
    const contentInput = page.getByPlaceholder(/Start writing your note|Markdownでノートを書き始め/i).first();
    await contentInput.fill(noteContent);
    
    // Wait for auto-save - use visible filter
    await page.waitForTimeout(1500);
    const savedIndicator = page.locator('span').filter({ hasText: /Saved|保存しました/i }).first();
    await expect(savedIndicator).toBeVisible({ timeout: 35000 });

    // 4. Summarize -> Auto transition to Chat/Summary view
    console.log('[Mobile Test] Summarizing');
    await page.getByRole('button', { name: /Summarize note|ノートを要約/i }).click();
    
    // Verify Summary response is visible - look for paragraph with Summary text
    await page.waitForTimeout(2000); // Allow loading to start
    const aiResponse = page.locator('p.whitespace-pre-wrap').filter({ hasText: /Summary|要約/i }).first();
    await expect(aiResponse).toBeVisible({ timeout: 60000 });
    
    // 5. Navigation tests using bottom nav
    console.log('[Mobile Test] Testing bottom navigation');
    
    await page.getByRole('button', { name: /View Folders|フォルダを表示/i }).click();
    await expect(page.getByRole('heading', { name: /Folders|フォルダ/i })).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: /View Notes|ノートを表示/i }).click();
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(folderName, 'i') })).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: /View Editor|エディタを表示/i }).click();
    await expect(page.getByPlaceholder(/Note title|ノートのタイトル/i).first()).toHaveValue(noteTitle, { timeout: 20000 });
  });
});
