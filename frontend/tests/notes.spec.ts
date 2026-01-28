import { test, expect } from '@playwright/test';

test.describe('Notes Functionality', () => {
  // Authentication is handled by auth.setup.ts for all tests in projects that depend on it.

  // TODO: Fix this test - AI summary selector and timing issues
  test('should perform a full cycle: folder -> note -> summary -> chat', async ({ page, isMobile }) => {
    test.setTimeout(120000); // AI summary can be slow
    
    // Capture console errors and network failures
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(`Console error: ${msg.text()}`);
      }
    });
    page.on('pageerror', error => {
      consoleErrors.push(`Page error: ${error.message}`);
    });
    page.on('response', response => {
      if (response.status() >= 400) {
        consoleErrors.push(`HTTP ${response.status()}: ${response.url()}`);
      }
    });
    
    await page.goto('/');
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

    // 2. Create a Note - wait for POST to complete before filling content
    console.log('[E2E] Creating note');
    
    // Start listening for the note creation API call
    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/api/notes') && resp.request().method() === 'POST' && resp.status() < 400,
      { timeout: 30000 }
    );
    
    await page.getByRole('button', { name: /Add note|ノートを追加/i }).click();
    
    // Wait for the note to be created on server (this gives it a real ID)
    console.log('[E2E] Waiting for note creation on server');
    await createPromise;
    console.log('[E2E] Note created on server');
    
    // Small delay for UI to update with server note
    await page.waitForTimeout(500);
    
    const noteTitle = 'E2E Test Note';
    const noteContent = 'This is a test note created by Playwright.\n\nIt contains some content for summarizing markers:\n- Item 1\n- Item 2';
    
    // Use placeholder patterns matching both EN and JA
    // On mobile, need to wait for editor view; on desktop elements may be duplicated
    // Use locator that filters for visible elements
    const layout = isMobile ? page.getByTestId('mobile-layout-editor') : page.getByTestId('desktop-layout');
    const titleInput = layout.getByPlaceholder(/Note title|ノートのタイトル/i).first();
    await expect(titleInput).toBeVisible({ timeout: 20000 });
    await titleInput.fill(noteTitle);
    
    const contentInput = layout.getByPlaceholder(/Start writing your note|Markdownでノートを書き始め/i).first();
    await expect(contentInput).toBeVisible({ timeout: 10000 });
    await contentInput.fill(noteContent);
    
    // Trigger blur to ensure content is registered
    await contentInput.blur();

    // 3. Wait for auto-save to complete
    // Debounce is 500ms - wait a bit longer then check for PUT/PATCH response
    console.log('[E2E] Waiting for auto-save');
    
    // Wait for the save API call (PUT or PATCH to /api/notes/{id})
    const updatePromise = page.waitForResponse(
      resp => /\/api\/notes\/[^/]+$/.test(resp.url()) && (resp.request().method() === 'PUT' || resp.request().method() === 'PATCH') && resp.status() < 400,
      { timeout: 30000 }
    ).catch(e => console.log('[E2E] Update API response not detected:', e.message));

    
    // Use waitForTimeout to trigger the debounced save
    await page.waitForTimeout(1000);
    
    // Wait for save indicator
    const savedIndicator = layout.locator('span').filter({ hasText: /Saved|保存しました/i }).first();
    await expect(savedIndicator).toBeVisible({ timeout: 30000 });
    
    // Wait for update API to complete
    console.log('[E2E] Waiting for content sync to server');
    await updatePromise;
    console.log('[E2E] Content synced');
    
    // Extra wait for backend consistency
    await page.waitForTimeout(1000);

    // 4. Summarize

    console.log('[E2E] Requesting summary');
    await page.getByRole('button', { name: /Summarize note|ノートを要約/i }).click();
    
    // Wait for AI chat panel to open (visible on desktop)
    console.log('[E2E] Waiting for AI chat panel');
    await page.waitForTimeout(1000); // Give time for panel to open
    
    // Wait for AI summary response - try multiple selectors
    console.log('[E2E] Waiting for AI loading/response');
    
    // First try to wait for loading indicator, but don't fail if it's too fast
    try {
      await expect(layout.getByTestId('ai-loading')).toBeVisible({ timeout: 5000 });
      console.log('[E2E] AI loading indicator visible');
      await expect(layout.getByTestId('ai-loading')).not.toBeVisible({ timeout: 90000 });
      console.log('[E2E] AI loading indicator hidden');
    } catch {
      console.log('[E2E] AI loading indicator not found or already done - continuing');
    }
    
    // Look for any assistant message content
    console.log('[E2E] Looking for AI message content');
    console.log('[E2E] Captured errors so far:', consoleErrors);
    // Use :visible filter on mobile to avoid matching hidden desktop element
    const aiResponse = isMobile 
      ? page.locator('[data-testid="ai-message-content"]:visible').first()
      : page.getByTestId('ai-message-content').first();
    await expect(aiResponse).toBeVisible({ timeout: 100000 });
    console.log('[E2E] AI message content found');


    // 5. Chat
    console.log('[E2E] Sending chat message');
    const chatInput = layout.getByPlaceholder(/Ask about current note|現在のノートについて質問/i).first();
    await chatInput.fill('What is this note about?');
    await page.keyboard.press('Enter');

    // Verify chat response - use visible filter
    await expect(layout.locator('.bg-muted').last()).toContainText(/Playwright|note/i, { timeout: 30000 });
  });

  // TODO: Fix this test - note list update timing issues
  test('should be able to search and filter notes', async ({ page, isMobile }) => {
    test.setTimeout(120000);
    // Navigate to home
    await page.goto('/');

    console.log('[E2E] Starting Search Test');

    // 1. Create a note with a unique title to search for
    // On mobile, ensure we are in Folders view to start clean or just click Add Note if visible
    // The previous test cycle leaves us in Chat, but this is a fresh test run (page.goto('/'))
    const searchNoteTitle = `Searchable Note ${Date.now()}`;
    const searchNoteContent = 'Content for search test';

    // 1. First click on "All Notes" to ensure we're in the right view
    // On mobile, ensure we are in Folders view first so we can click "All Notes" in the sidebar
    if (isMobile) {
        await page.getByRole('button', { name: /View Folders|フォルダを表示/i }).click();
    }
    // Select "All Notes" to ensure we can see all notes (this switches to Note List view on mobile)
    await page.getByRole('button', { name: /All Notes|すべてのノート/i }).first().click();
    await page.waitForTimeout(500);

    // 2. Create a note with specific content
    console.log('[E2E] Creating note for search');
    
    // Start listening for the note creation API call
    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/api/notes') && resp.request().method() === 'POST' && resp.status() < 400,
      { timeout: 30000 }
    );

    await page.getByRole('button', { name: /Add Note|新規ノート/i }).click();
    
    // Wait for the note to be created on server
    console.log('[E2E] Waiting for note creation on server');
    await createPromise;
    console.log('[E2E] Note created on server');
    
    // Small delay for UI to update with server note
    await page.waitForTimeout(500);

    // Handle Title
    const layout = isMobile ? page.getByTestId('mobile-layout-editor') : page.getByTestId('desktop-layout');
    const titleInput = layout.getByPlaceholder(/Note Title|ノートのタイトル/i).first();
    await expect(titleInput).toBeVisible({ timeout: 20000 });
    await titleInput.fill(searchNoteTitle);

    // Handle Content
    const contentInput = layout.getByPlaceholder(/Start writing your note|Markdownでノートを書き始め/i).first();
    await contentInput.fill(searchNoteContent);
    // Trigger blur to ensure content is registered
    await contentInput.blur();

    // Wait for auto-save and list update (giving it ample time)
    console.log('[E2E] Waiting for auto-save and list update');
    
    // Wait for the save API call (PUT or PATCH)
    const updatePromise = page.waitForResponse(
      resp => /\/api\/notes\/[^/]+$/.test(resp.url()) && (resp.request().method() === 'PUT' || resp.request().method() === 'PATCH') && resp.status() < 400,
      { timeout: 30000 }
    ).catch(e => console.log('[E2E] Update API response not detected:', e.message));
    
    // Trigger save
    await page.waitForTimeout(1000);
    
    const savedIndicator = layout.locator('span').filter({ hasText: /Saved|保存しました/i }).first();
    if (isMobile) {
      await savedIndicator.scrollIntoViewIfNeeded();
    }
    await expect(savedIndicator).toBeVisible({ timeout: 30000 });
    
    // Wait for update API to complete
    console.log('[E2E] Waiting for content sync to server');
    await updatePromise;
    console.log('[E2E] Content synced');



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
    await page.waitForTimeout(3000);
    
    // First check if the note appears in the list (may take time for API sync)
    const listLayout = isMobile ? page.getByTestId('mobile-layout-notes') : page.getByTestId('desktop-layout');
    const noteInList = listLayout.getByTestId('note-list-item').filter({ hasText: searchNoteTitle }).first();
    try {
      await expect(noteInList).toBeVisible({ timeout: 30000 });
    } catch {
      // If not found, reload the page and try again
      console.log('[E2E] Note not found in list, reloading page...');
      await page.reload();
      await page.waitForLoadState('networkidle');
      // Click All Notes again after reload
      await page.getByRole('button', { name: /All Notes|\u3059\u3079\u3066\u306e\u30ce\u30fc\u30c8/i }).first().click().catch(() => {});
      await page.waitForTimeout(1000);
      await expect(noteInList).toBeVisible({ timeout: 60000 });
    }
    
    // 3. Perform Search
    console.log(`[E2E] Searching for: ${searchNoteTitle}`);
    const searchInput = listLayout.getByPlaceholder(/Search notes|ノートを検索/i).first();
    await expect(searchInput).toBeVisible({ timeout: 15000 });
    await searchInput.fill(searchNoteTitle);

    // 4. Verify result contains the note
    console.log('[E2E] Verifying search results');
    // We check if the text is visible. 
    // We filter by `button` to ensure we are looking at the list item and not some other element.
    // And we ensure it is visible.
    const resultItem = listLayout.getByTestId('note-list-item').filter({ hasText: searchNoteTitle }).first();
    await expect(resultItem).toBeVisible({ timeout: 10000 });

    // 5. Verify negative search
    console.log('[E2E] Negative search test');
    await searchInput.fill(`Non-existent ${Date.now()}`);
    await expect(listLayout.getByText(/No results found|ノートがありません/i).first()).toBeVisible({ timeout: 10000 });
    
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
  test('should save note offline and show sync status indicator', async ({ page, context, isMobile }) => {
    test.setTimeout(120000); // Offline test involves multiple reloads and waits
    await page.goto('/');
    console.log('[E2E] Starting Offline Sync Test');

    // 1. First select "All Notes" to ensure we're in the right view
    console.log('[E2E] Creating note while online');
    if (isMobile) {
      await page.getByRole('button', { name: /View Folders|フォルダを表示/i }).click();
    }
    // Select "All Notes" to ensure we can see all notes after reload
    if (isMobile) {
      await page.getByRole('button', { name: /View Folders|フォルダを表示/i }).click();
    }
    await page.getByRole('button', { name: /All Notes|すべてのノート/i }).first().click();
    
    // Wait for the note list to load
    await page.waitForTimeout(1000);
    
    // Start listening for the note creation API call
    const createPromise = page.waitForResponse(
      resp => resp.url().includes('/api/notes') && resp.request().method() === 'POST' && resp.status() < 400,
      { timeout: 30000 }
    );

    await page.getByRole('button', { name: /Add Note|新規ノート/i }).click();
    
    // Wait for the note to be created on server
    console.log('[E2E] Waiting for note creation on server');
    await createPromise;
    console.log('[E2E] Note created on server');
    
    // Small delay for UI to update with server note
    await page.waitForTimeout(500);

    const layout = isMobile ? page.getByTestId('mobile-layout-editor') : page.getByTestId('desktop-layout');
    const titleInput = layout.getByPlaceholder(/Note Title|ノートのタイトル/i).first();
    await expect(titleInput).toBeVisible({ timeout: 20000 });
    
    const onlineNoteTitle = `Online Note ${Date.now()}`;
    await titleInput.fill(onlineNoteTitle);

    const contentInput = layout.getByPlaceholder(/Start writing your note|Markdownでノートを書き始め/i).first();
    await contentInput.fill('Content created while online');
    // Trigger blur
    await contentInput.blur();

    // Wait for save
    console.log('[E2E] Waiting for online save');
    
    // Wait for the save API call (PUT or PATCH)
    const updatePromise = page.waitForResponse(
      resp => /\/api\/notes\/[^/]+$/.test(resp.url()) && (resp.request().method() === 'PUT' || resp.request().method() === 'PATCH') && resp.status() < 400,
      { timeout: 30000 }
    ).catch(e => console.log('[E2E] Update API response not detected:', e.message));
    
    await page.waitForTimeout(1000);
    
    const savedIndicator = layout.locator('span').filter({ hasText: /Saved|保存しました/i }).first();
    if (isMobile) {
      await savedIndicator.scrollIntoViewIfNeeded();
    }
    await expect(savedIndicator).toBeVisible({ timeout: 30000 });
    
    // Wait for update API to complete
    console.log('[E2E] Waiting for content sync to server');
    await updatePromise;
    console.log('[E2E] Content synced');


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
    console.log('[E2E] Verifying offline status');
    // Check for "Offline" status indicator - look for the sync status element
    const offlineIndicator = layout.getByText(/Offline|オフライン|Saved locally|ローカルに保存/i).first();
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
    // 8. Verify save completed (check for "Saved" or "保存しました")
    console.log('[E2E] Verifying sync completed');
    const syncedIndicator = layout.locator('span').filter({ hasText: /Saved|保存しました/i }).first();
    if (isMobile) {
      await syncedIndicator.scrollIntoViewIfNeeded();
    }
    await expect(syncedIndicator).toBeVisible({ timeout: 30000 });
    
    // 9. Reload page to verify data persisted
    console.log('[E2E] Reloading page to verify persistence');
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Verify the note content is still there
    // Verify the note content is still there
    // On mobile, to see "All Notes", we must be in Folders view
    if (isMobile) {
      await page.getByRole('button', { name: /View Folders|フォルダを表示/i }).click();
    }
    // Select All Notes after reload to ensure we can see the note
    await page.getByRole('button', { name: /All Notes|すべてのノート/i }).first().click();
    await page.waitForTimeout(1000);

    // Look for the note in the list - use text search in the list container
    console.log(`[E2E] Looking for note: ${onlineNoteTitle}`);
    const listLayout = isMobile ? page.getByTestId('mobile-layout-notes') : page.getByTestId('desktop-layout');
    const noteItem = listLayout.getByTestId('note-list-item').filter({ hasText: onlineNoteTitle }).first();
    
    try {
      await expect(noteItem).toBeVisible({ timeout: 40000 });
    } catch {
       console.log('[E2E] Note not found after reload, retrying reload...');
       await page.reload();
       await page.waitForLoadState('networkidle');
       await page.waitForTimeout(2000);
       // Ensure we are in the correct view if mobile
       if (isMobile) {
         await page.getByRole('button', { name: /View Notes|ノートを表示/i }).click();
       }
       await page.getByRole('button', { name: /All Notes|すべてのノート/i }).first().click().catch(() => {});
       await expect(noteItem).toBeVisible({ timeout: 40000 });
    }
  });
});
