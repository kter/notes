import { test, expect } from '@playwright/test';

test.describe('Notes Functionality', () => {
  // Authentication is handled by auth.setup.ts for all tests in projects that depend on it.

  test('should perform a full cycle: folder -> note -> summary -> chat', async ({ page }) => {
    await page.goto('/');

    // 1. Create a Folder
    console.log('[E2E] Creating folder');
    await page.getByRole('button', { name: 'Add folder' }).click();
    const folderName = `Test Folder ${Date.now()}`;
    await page.getByPlaceholder('Folder name').fill(folderName);
    await page.keyboard.press('Enter');

    // Select the newly created folder
    console.log(`[E2E] Selecting folder: ${folderName}`);
    const folderButton = page.getByRole('button', { name: folderName });
    await expect(folderButton).toBeVisible({ timeout: 15000 });
    await folderButton.click();

    // Verify folder heading in NoteList
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(folderName, 'i') })).toBeVisible({ timeout: 15000 });

    // 2. Create a Note
    console.log('[E2E] Creating note');
    await page.getByRole('button', { name: 'Add note' }).click();
    
    const noteTitle = 'E2E Test Note';
    const noteContent = 'This is a test note created by Playwright.\n\nIt contains some content for summarizing markers:\n- Item 1\n- Item 2';
    
    await page.getByLabel('Note title').fill(noteTitle);
    await page.getByLabel('Note content').fill(noteContent);

    // 3. Wait for auto-save (multi-lingual support)
    // Debounce is 500ms. We use a more robust locator for the status text.
    console.log('[E2E] Waiting for auto-save');
    await page.waitForTimeout(1000); 
    // ja: "保存しました", en: "Saved"
    // Using a more general text locator that matches exactly or partially
    const savedIndicator = page.locator('span').filter({ hasText: /Saved|保存しました/i });
    await expect(savedIndicator.first()).toBeVisible({ timeout: 30000 });

    // 4. Summarize
    console.log('[E2E] Requesting summary');
    await page.getByRole('button', { name: 'Summarize note' }).click();

    // Wait for AI summary
    await expect(page.getByText(/Summary|要約/i).first()).toBeVisible({ timeout: 45000 });

    // 5. Chat
    console.log('[E2E] Sending chat message');
    await page.getByPlaceholder(/Ask about current note|質問を入力/i).fill('What is this note about?');
    await page.keyboard.press('Enter');

    // Verify chat response
    await expect(page.locator('.bg-muted').last()).toContainText(/Playwright|note/i, { timeout: 30000 });
  });

  test('should be able to search and filter notes', async ({ page }) => {
    await page.goto('/');

    const searchInput = page.getByPlaceholder(/Search notes|ノートを検索/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('Non-existent note name');
      await expect(page.getByText(/No notes|ノートがありません/i)).toBeVisible({ timeout: 10000 });
    }
  });

  test('should toggle mobile views correctly', async ({ page, isMobile }) => {
    if (!isMobile) return;

    await page.goto('/');
    
    // Switch to Notes view
    await page.getByRole('button', { name: 'View Notes' }).click();
    await expect(page.getByRole('heading', { name: /All Notes|ノート/i })).toBeVisible({ timeout: 20000 });
    
    // Switch back to Folders view
    await page.getByRole('button', { name: 'View Folders' }).click();
    await expect(page.getByRole('heading', { name: /Folders|フォルダ/i })).toBeVisible({ timeout: 20000 });
  });
});
