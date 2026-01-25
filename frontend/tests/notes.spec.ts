import { test, expect } from '@playwright/test';

test.describe('Notes Functionality', () => {
  // Authentication is handled by auth.setup.ts for all tests in projects that depend on it.

  test('should perform a full cycle: folder -> note -> summary -> chat', async ({ page, isMobile }) => {
    await page.goto('/');

    // 1. Create a Folder
    console.log('[E2E] Creating folder');
    await page.getByRole('button', { name: /Add folder|フォルダを追加/i }).click();
    const folderName = `Test Folder ${Date.now()}`;
    await page.getByPlaceholder(/Folder name|フォルダ名/i).fill(folderName);
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
    await page.getByRole('button', { name: /Add note|ノートを追加/i }).click();
    
    const noteTitle = 'E2E Test Note';
    const noteContent = 'This is a test note created by Playwright.\n\nIt contains some content for summarizing markers:\n- Item 1\n- Item 2';
    
    // Use placeholder patterns matching both EN and JA
    // On mobile, need to wait for editor view; on desktop elements may be duplicated
    // Use locator that filters for visible elements
    const titleInput = page.getByPlaceholder(/Note title|ノートのタイトル/i).locator('visible=true').first();
    await expect(titleInput).toBeVisible({ timeout: 20000 });
    await titleInput.fill(noteTitle);
    
    const contentInput = page.getByPlaceholder(/Start writing your note|Markdownでノートを書き始め/i).locator('visible=true').first();
    await contentInput.fill(noteContent);

    // 3. Wait for auto-save (multi-lingual support)
    // Debounce is 500ms. We use a more robust locator for the status text.
    console.log('[E2E] Waiting for auto-save');
    await page.waitForTimeout(1500); 
    // ja: "保存しました", en: "Saved"
    // Using visible filter to avoid selecting hidden desktop/mobile elements
    const savedIndicator = page.locator('span').filter({ hasText: /Saved|保存しました/i }).locator('visible=true').first();
    await expect(savedIndicator).toBeVisible({ timeout: 30000 });

    // 4. Summarize
    console.log('[E2E] Requesting summary');
    await page.getByRole('button', { name: /Summarize note|ノートを要約/i }).click();
    // Wait for AI summary - use visible filter for mobile compatibility
    await expect(page.getByText(/Summary|要約/i).locator('visible=true').first()).toBeVisible({ timeout: 45000 });

    // 5. Chat
    console.log('[E2E] Sending chat message');
    const chatInput = page.getByPlaceholder(/Ask about current note|現在のノートについて質問/i).locator('visible=true').first();
    await chatInput.fill('What is this note about?');
    await page.keyboard.press('Enter');

    // Verify chat response - use visible filter
    await expect(page.locator('.bg-muted').locator('visible=true').last()).toContainText(/Playwright|note/i, { timeout: 30000 });
  });

  test('should be able to search and filter notes', async ({ page, isMobile }) => {
    // Navigate to home
    await page.goto('/');

    console.log('[E2E] Starting Search Test');

    // 1. Create a note with a unique title to search for
    // On mobile, ensure we are in Folders view to start clean or just click Add Note if visible
    // The previous test cycle leaves us in Chat, but this is a fresh test run (page.goto('/'))
    const searchNoteTitle = `Searchable Note ${Date.now()}`;
    const searchNoteContent = 'Content for search test';

    // 1. Create a note with specific content
    if (isMobile) {
        // Mobile flow
        await page.getByRole('button', { name: /View Notes|ノートを表示/i }).click();
    }
    await page.getByRole('button', { name: /Add Note|新規ノート/i }).click();
    console.log('[E2E] Creating note for search');

    // Handle Title
    const titleInput = page.getByPlaceholder(/Note Title|ノートのタイトル/i).locator('visible=true').first();
    await titleInput.fill(searchNoteTitle);

    // Handle Content
    const contentInput = page.getByPlaceholder(/Start writing your note|Markdownでノートを書き始め/i).locator('visible=true').first();
    await contentInput.fill(searchNoteContent);

    // Wait for auto-save and list update (giving it ample time)
    console.log('[E2E] Waiting for auto-save and list update');
    await page.waitForTimeout(3000);
    const savedIndicator = page.locator('span').filter({ hasText: /Saved|保存しました/i }).locator('visible=true').first();
    await expect(savedIndicator).toBeVisible({ timeout: 30000 });

    // Verify that we can generate a title (if applicable) or just check note creation
    // For this test, we care about the search functionality
    
    // 2. Go to Note List to search (Mobile check)
    // On Desktop, Note List is always visible, but good to ensure we check it.
    if (isMobile) {
      console.log('[E2E] Switching to Notes view');
      await page.getByRole('button', { name: /View Notes|ノートを表示/i }).click();
    }

    // 2.5 Verify Note Title Update in List BEFORE Search
    console.log('[E2E] Verifying note title updated in list before search');
    
    // Use a loose text match first to see if it's there
    await expect(page.locator('button').filter({ hasText: searchNoteTitle }).first()).toBeVisible({ timeout: 10000 });
    
    // 3. Perform Search
    console.log(`[E2E] Searching for: ${searchNoteTitle}`);
    const searchInput = page.getByPlaceholder(/Search notes|ノートを検索/i).locator('visible=true').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill(searchNoteTitle);

    // 4. Verify result contains the note
    console.log('[E2E] Verifying search results');
    // We check if the text is visible. 
    // We filter by `button` to ensure we are looking at the list item and not some other element.
    // And we ensure it is visible.
    const resultItem = page.locator('button').filter({ hasText: searchNoteTitle }).first();
    await expect(resultItem).toBeVisible({ timeout: 10000 });

    // 5. Verify negative search
    console.log('[E2E] Negative search test');
    await searchInput.fill(`Non-existent ${Date.now()}`);
    await expect(page.getByText(/No results found|ノートがありません/i).first()).toBeVisible({ timeout: 10000 });
    
    // Clear search
    await searchInput.fill('');
  });

  test('should open settings and display correct content', async ({ page, isMobile }) => {
    await page.goto('/');
    console.log('[E2E] Starting Settings Test');

    // 1. Open Settings
    // On mobile, settings button is in the Footer of the Sidebar (Folders view)
    if (isMobile) {
      // Ensure we are in Folders view
      await page.getByRole('button', { name: /View Folders|フォルダを表示/i }).click().catch(() => {});
      await expect(page.getByRole('heading', { name: /Folders|フォルダ/i })).toBeVisible();
    }

    console.log('[E2E] Opening Settings dialog');
    // Settings icon button has title="Settings"
    await page.getByRole('button', { name: 'Settings' }).locator('visible=true').click();

    // 2. Verify Dialog Content
    console.log('[E2E] Verifying Settings content');
    // Title
    await expect(page.getByRole('heading', { name: /Settings|設定/i })).toBeVisible({ timeout: 10000 });
    
    // Language Selection
    await expect(page.getByLabel(/Language|言語/i)).toBeVisible();
    
    // Model Selection
    await expect(page.getByLabel(/AI Model|AIモデル/i)).toBeVisible();

    // 3. Close Settings
    console.log('[E2E] Closing Settings');
    // Click Cancel or outside, or hit Escape. The dialog has a Cancel button.
    await page.getByRole('button', { name: /Cancel|キャンセル/i }).click();
    
    // Verify dialog is gone
    await expect(page.getByRole('heading', { name: /Settings|設定/i })).not.toBeVisible();
  });
});
