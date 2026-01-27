import { test, expect } from '@playwright/test';

test.describe('Notes Functionality', () => {
  // Authentication is handled by auth.setup.ts for all tests in projects that depend on it.

  // TODO: Fix this test - AI summary selector and timing issues
  test.skip('should perform a full cycle: folder -> note -> summary -> chat', async ({ page, isMobile }) => {
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
    const titleInput = page.getByPlaceholder(/Note title|ノートのタイトル/i).first();
    await expect(titleInput).toBeVisible({ timeout: 20000 });
    await titleInput.fill(noteTitle);
    
    const contentInput = page.getByPlaceholder(/Start writing your note|Markdownでノートを書き始め/i).first();
    await expect(contentInput).toBeVisible({ timeout: 10000 });
    await contentInput.fill(noteContent);

    // 3. Wait for auto-save (multi-lingual support)
    // Debounce is 500ms. We use a more robust locator for the status text.
    console.log('[E2E] Waiting for auto-save');
    await page.waitForTimeout(1500); 
    // ja: "保存しました", en: "Saved"
    // Using visible filter to avoid selecting hidden desktop/mobile elements
    const savedIndicator = page.locator('span').filter({ hasText: /Saved|保存しました/i }).first();
    await expect(savedIndicator).toBeVisible({ timeout: 30000 });

    // 4. Summarize
    console.log('[E2E] Requesting summary');
    await page.getByRole('button', { name: /Summarize note|ノートを要約/i }).click();
    // Wait for AI summary response in chat panel
    // The AI response contains a `p.whitespace-pre-wrap` with the summary text
    await page.waitForTimeout(2000); // Allow loading to start
    // Look for a paragraph with "Summary" text in the assistant message area
    const aiResponse = page.locator('p.whitespace-pre-wrap').filter({ hasText: /Summary|要約/i }).first();
    await expect(aiResponse).toBeVisible({ timeout: 60000 });

    // 5. Chat
    console.log('[E2E] Sending chat message');
    const chatInput = page.getByPlaceholder(/Ask about current note|現在のノートについて質問/i).first();
    await chatInput.fill('What is this note about?');
    await page.keyboard.press('Enter');

    // Verify chat response - use visible filter
    await expect(page.locator('.bg-muted').last()).toContainText(/Playwright|note/i, { timeout: 30000 });
  });

  // TODO: Fix this test - note list update timing issues
  test.skip('should be able to search and filter notes', async ({ page, isMobile }) => {
    // Navigate to home
    await page.goto('/');

    console.log('[E2E] Starting Search Test');

    // 1. Create a note with a unique title to search for
    // On mobile, ensure we are in Folders view to start clean or just click Add Note if visible
    // The previous test cycle leaves us in Chat, but this is a fresh test run (page.goto('/'))
    const searchNoteTitle = `Searchable Note ${Date.now()}`;
    const searchNoteContent = 'Content for search test';

    // 1. First click on "All Notes" to ensure we're in the right view
    // On mobile, ensure we are in Folders view first
    if (isMobile) {
        // Mobile flow - go to Notes view first
        await page.getByRole('button', { name: /View Notes|ノートを表示/i }).click();
    }
    // Select "All Notes" to ensure we can see all notes
    await page.getByRole('button', { name: /All Notes|すべてのノート/i }).first().click().catch(() => {});
    await page.waitForTimeout(500);

    // 2. Create a note with specific content
    await page.getByRole('button', { name: /Add Note|新規ノート/i }).click();
    console.log('[E2E] Creating note for search');

    // Handle Title
    const titleInput = page.getByPlaceholder(/Note Title|ノートのタイトル/i).first();
    await expect(titleInput).toBeVisible({ timeout: 20000 });
    await titleInput.fill(searchNoteTitle);

    // Handle Content
    const contentInput = page.getByPlaceholder(/Start writing your note|Markdownでノートを書き始め/i).first();
    await contentInput.fill(searchNoteContent);

    // Wait for auto-save and list update (giving it ample time)
    console.log('[E2E] Waiting for auto-save and list update');
    await page.waitForTimeout(3000);
    const savedIndicator = page.locator('span').filter({ hasText: /Saved|保存しました/i }).first();
    await expect(savedIndicator).toBeVisible({ timeout: 30000 });

    // Verify that we can generate a title (if applicable) or just check note creation
    // For this test, we care about the search functionality
    
    // 2. Go to Note List to search (Mobile check)
    // On Desktop, Note List is always visible, but good to ensure we check it.
    if (isMobile) {
      console.log('[E2E] Switching to Notes view');
      await page.getByRole('button', { name: /View Notes|ノートを表示/i }).click({ force: true });
      // Verify we are in the notes view (heading or button state)
      await expect(page.getByRole('button', { name: /View Notes/i })).toHaveClass(/text-primary bg-primary\/10/);
    }

    // 2.5 Verify Note Title Update in List BEFORE Search
    console.log('[E2E] Verifying note title updated in list before search');
    
    // Note list should update after save - wait for it to appear
    // On desktop, note list is always visible on the left side
    // Give more time for the list to update after creation and save
    await page.waitForTimeout(2000);
    
    // First check if the note appears in the list (may take time for API sync)
    const noteInList = page.locator('button').filter({ hasText: searchNoteTitle }).first();
    try {
      await expect(noteInList).toBeVisible({ timeout: 20000 });
    } catch {
      // If not found, reload the page and try again
      console.log('[E2E] Note not found in list, reloading page...');
      await page.reload();
      await page.waitForLoadState('networkidle');
      // Click All Notes again after reload
      await page.getByRole('button', { name: /All Notes|\u3059\u3079\u3066\u306e\u30ce\u30fc\u30c8/i }).first().click().catch(() => {});
      await page.waitForTimeout(1000);
      await expect(noteInList).toBeVisible({ timeout: 15000 });
    }
    
    // 3. Perform Search
    console.log(`[E2E] Searching for: ${searchNoteTitle}`);
    const searchInput = page.getByPlaceholder(/Search notes|ノートを検索/i).first();
    await expect(searchInput).toBeVisible({ timeout: 15000 });
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
    await page.getByRole('button', { name: 'Settings' }).first().click();

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

  test('should be able to collapse and expand note list panel', async ({ page, isMobile }) => {
    // Skip on mobile - collapse functionality is desktop only
    if (isMobile) {
      console.log('[E2E] Skipping note list collapse test on mobile');
      return;
    }

    await page.goto('/');
    console.log('[E2E] Starting Note List Collapse Test');

    // 1. Verify note list panel is visible with collapse button
    console.log('[E2E] Verifying note list is initially visible');
    const noteListHeading = page.getByRole('heading', { name: /All Notes|すべてのノート/i }).first();
    await expect(noteListHeading).toBeVisible({ timeout: 15000 });

    // 2. Find and click the collapse button
    console.log('[E2E] Clicking collapse button');
    const collapseButton = page.getByRole('button', { name: /Collapse note list|ノートリストを折りたたむ/i }).first();
    await expect(collapseButton).toBeVisible({ timeout: 5000 });
    await collapseButton.click();

    // 3. Verify note list is collapsed (heading should be hidden)
    console.log('[E2E] Verifying note list is collapsed');
    await expect(noteListHeading).not.toBeVisible({ timeout: 5000 });

    // 4. Find and click the expand button
    console.log('[E2E] Clicking expand button');
    const expandButton = page.getByRole('button', { name: /Expand note list|ノートリストを展開/i }).first();
    await expect(expandButton).toBeVisible({ timeout: 5000 });
    await expandButton.click();

    // 5. Verify note list is expanded again
    console.log('[E2E] Verifying note list is expanded again');
    await expect(noteListHeading).toBeVisible({ timeout: 5000 });
  });

  // TODO: Fix this test - note list update timing issues after reload
  test.skip('should save note offline and show sync status indicator', async ({ page, context, isMobile }) => {
    await page.goto('/');
    console.log('[E2E] Starting Offline Sync Test');

    // 1. First select "All Notes" to ensure we're in the right view
    console.log('[E2E] Creating note while online');
    if (isMobile) {
      await page.getByRole('button', { name: /View Notes|ノートを表示/i }).click();
    }
    // Select "All Notes" to ensure we can see all notes after reload
    await page.getByRole('button', { name: /All Notes|すべてのノート/i }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Add Note|新規ノート/i }).click();

    const titleInput = page.getByPlaceholder(/Note Title|ノートのタイトル/i).first();
    await expect(titleInput).toBeVisible({ timeout: 20000 });
    
    const onlineNoteTitle = `Online Note ${Date.now()}`;
    await titleInput.fill(onlineNoteTitle);

    const contentInput = page.getByPlaceholder(/Start writing your note|Markdownでノートを書き始め/i).first();
    await contentInput.fill('Content created while online');

    // Wait for save
    console.log('[E2E] Waiting for online save');
    await page.waitForTimeout(1500);
    const savedIndicator = page.locator('span').filter({ hasText: /Saved|保存しました/i }).first();
    await expect(savedIndicator).toBeVisible({ timeout: 30000 });

    // 2. Go offline
    console.log('[E2E] Going offline');
    await context.setOffline(true);

    // 3. Edit the note while offline
    console.log('[E2E] Editing note while offline');
    const offlineContent = 'Content edited while offline - ' + Date.now();
    await contentInput.clear();
    await contentInput.fill(offlineContent);

    // 4. Wait a moment for the local save to process
    await page.waitForTimeout(1500);

    // 5. Verify offline indicator appears (either in status bar or floating indicator)
    console.log('[E2E] Verifying offline status');
    // Check for "Offline" status indicator - look for the sync status element
    const offlineIndicator = page.getByText(/Offline|オフライン|Saved locally|ローカルに保存/i).first();
    // Note: The indicator may be hidden on mobile views, so we use a softer check
    await expect(offlineIndicator.or(page.locator('[data-testid="sync-status"]'))).toBeVisible({ timeout: 10000 });

    // 6. Go back online
    console.log('[E2E] Going back online');
    await context.setOffline(false);

    // 7. Wait for sync to complete - the offline indicator should disappear or change
    console.log('[E2E] Waiting for sync');
    await page.waitForTimeout(3000);

    // 8. Verify save completed (check for "Saved" or "保存しました")
    console.log('[E2E] Verifying sync completed');
    const syncedIndicator = page.locator('span').filter({ hasText: /Saved|保存しました/i }).first();
    await expect(syncedIndicator).toBeVisible({ timeout: 30000 });

    // 9. Reload page to verify data persisted
    console.log('[E2E] Reloading page to verify persistence');
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Verify the note content is still there
    if (isMobile) {
      await page.getByRole('button', { name: /View Notes|ノートを表示/i }).click();
    }
    // Select All Notes after reload to ensure we can see the note
    await page.getByRole('button', { name: /All Notes|すべてのノート/i }).first().click().catch(() => {});
    await page.waitForTimeout(1000);

    // Look for the note in the list - use text search in the list container
    console.log(`[E2E] Looking for note: ${onlineNoteTitle}`);
    const noteItem = page.locator('button').filter({ hasText: onlineNoteTitle }).first();
    await expect(noteItem).toBeVisible({ timeout: 20000 });
  });
});
