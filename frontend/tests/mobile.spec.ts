import { test, expect } from '@playwright/test';

test.describe('Mobile Comprehensive Scenario', () => {
  // Mobile testing requires isMobile to be true
  test.skip(({ isMobile }) => !isMobile, 'This test is only for mobile viewports');

  // TODO: Fix this test - AI summary selector and timing issues
  test('should navigate through sequential flow on mobile', async ({ page }) => {
    test.setTimeout(120000);
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

    // 3. Create Note -> Auto transition to Editor View
    console.log('[Mobile Test] Creating note');
    
    // Start listening for the note creation API call
    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/api/notes') && resp.request().method() === 'POST' && resp.status() < 400,
      { timeout: 30000 }
    );
    
    await page.getByRole('button', { name: /Add note|ノートを追加/i }).click();
    
    // Wait for the note to be created on server (this gives it a real ID)
    console.log('[Mobile Test] Waiting for note creation on server');
    await createPromise;
    console.log('[Mobile Test] Note created on server');
    
    // Small delay for UI to update with server note
    await page.waitForTimeout(500);
    
    const noteTitle = 'Mobile Note';
    const noteContent = 'Content created on a mobile device.';
    
    // Wait for editor view elements using placeholder patterns
    const layout = page.getByTestId('mobile-layout-editor');
    const titleInput = layout.getByPlaceholder(/Note title|ノートのタイトル/i).first();
    await expect(titleInput).toBeVisible({ timeout: 20000 });
    
    await titleInput.fill(noteTitle);
    const contentInput = layout.getByPlaceholder(/Start writing your note|Markdownでノートを書き始め/i).first();
    await contentInput.fill(noteContent);
    
    // Trigger blur to ensure content is registered
    await contentInput.blur();
    
    // Wait for auto-save to complete
    console.log('[Mobile Test] Waiting for auto-save');
    
    // Wait for the save API call (PUT or PATCH to /api/notes/{id})
    const updatePromise = page.waitForResponse(
      resp => /\/api\/notes\/[^/]+$/.test(resp.url()) && (resp.request().method() === 'PUT' || resp.request().method() === 'PATCH') && resp.status() < 400,
      { timeout: 30000 }
    ).catch(e => console.log('[Mobile Test] Update API response not detected:', e.message));
    
    // Wait a bit for debounced save to trigger
    await page.waitForTimeout(1000);
    
    const savedIndicator = layout.locator('span').filter({ hasText: /Saved|保存しました/i }).first();
    await expect(savedIndicator).toBeVisible({ timeout: 35000 });
    
    // Wait for update API to complete
    console.log('[Mobile Test] Waiting for content sync to server');
    await updatePromise;
    console.log('[Mobile Test] Content synced');
    
    // Extra wait for backend consistency
    await page.waitForTimeout(1000);

    // 4. Summarize -> Auto transition to Chat/Summary view
    console.log('[Mobile Test] Summarizing');
    await page.getByRole('button', { name: /Summarize note|ノートを要約/i }).click();
    
    // Verify Summary response is visible
    try {
      await expect(layout.getByTestId('ai-loading')).toBeVisible({ timeout: 5000 });
      console.log('[Mobile Test] AI loading visible');
      await expect(layout.getByTestId('ai-loading')).not.toBeVisible({ timeout: 90000 });
      console.log('[Mobile Test] AI loading hidden');
    } catch {
      console.log('[Mobile Test] AI loading indicator not found - continuing');
    }
    
    // On mobile, the AI panel is a fixed overlay - wait for message to appear then check content exists
    // Use .locator with visible filter to avoid matching hidden desktop element
    console.log('[Mobile Test] Looking for AI message content');
    const aiResponse = page.locator('[data-testid="ai-message-content"]:visible').first();
    await expect(aiResponse).toBeVisible({ timeout: 100000 });
    console.log('[Mobile Test] AI message content found');

    
    // 5. Navigation tests using bottom nav
    console.log('[Mobile Test] Testing bottom navigation');
    
    await page.getByRole('button', { name: /View Folders|フォルダを表示/i }).click();
    await expect(page.getByRole('heading', { name: /Folders|フォルダ/i })).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: /View Notes|ノートを表示/i }).click();
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(folderName, 'i') })).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: /View Editor|エディタを表示/i }).click();
    await expect(layout.getByPlaceholder(/Note title|ノートのタイトル/i).first()).toHaveValue(noteTitle, { timeout: 20000 });
  });
});
