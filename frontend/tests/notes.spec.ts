import { test, expect } from '@playwright/test';

import { createFolderFixture, createNoteFixture } from './helpers/apiFixtures';

test.describe('Notes Functionality', () => {
  // Authentication is handled by auth.setup.ts for all tests in projects that depend on it.

  test('should perform a full cycle: folder -> note -> summary -> chat', async ({ page, isMobile, browserName }) => {
    if (browserName === 'webkit') test.skip(); // Flaky on WebKit
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

    const folderName = `Test Folder ${Date.now()}`;
    const noteTitle = 'E2E Test Note';
    const noteContent = 'This is a test note created by Playwright.\n\nIt contains some content for summarizing markers:\n- Item 1\n- Item 2';

    await page.goto('/');
    console.log('[E2E] Creating fixtures');
    const createdFolder = await createFolderFixture(page, folderName);
    await createNoteFixture(page, {
      title: noteTitle,
      content: noteContent,
      folder_id: createdFolder.id,
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const sidebar = isMobile ? page.getByTestId('mobile-layout-folders') : page.getByTestId('desktop-layout');

    // Select the newly created folder
    console.log(`[E2E] Selecting folder: ${folderName}`);
    const folderButton = sidebar.getByTestId(`sidebar-folder-item-${createdFolder.id}`);
    await expect(folderButton).toBeVisible({ timeout: 15000 });
    await folderButton.click();

    // Verify folder heading in NoteList
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(folderName, 'i') })).toBeVisible({ timeout: 15000 });

    const noteList = isMobile ? page.getByTestId('mobile-layout-notes') : page.getByTestId('desktop-layout');
    const layout = isMobile ? page.getByTestId('mobile-layout-editor') : page.getByTestId('desktop-layout');
    const noteItem = noteList.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await expect(noteItem).toBeVisible({ timeout: 30000 });
    await noteItem.click();
    await expect(layout.getByTestId('editor-title-input')).toHaveValue(noteTitle, { timeout: 30000 });
    await expect(layout.getByTestId('editor-content-input')).toHaveValue(noteContent, { timeout: 30000 });

    // 4. Summarize
    console.log('[E2E] Requesting summary');
    const summarizeButton = layout.getByTestId('editor-summarize-button');
    const aiMessages = page.locator('[data-testid="ai-message-content"]:visible');
    let summarizeSucceeded = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
      await expect(summarizeButton).toBeEnabled({ timeout: 10000 });
      const summarizeResponsePromise = page.waitForResponse(
        resp => resp.url().includes('/api/ai/summarize') && resp.request().method() === 'POST',
        { timeout: 30000 }
      );

      await summarizeButton.click();
      const summarizeResponse = await summarizeResponsePromise;

      if (summarizeResponse.ok()) {
        summarizeSucceeded = true;
        break;
      }

      const errorText = await summarizeResponse.text().catch(() => '');
      console.log(`[E2E] Summary attempt ${attempt} failed: ${summarizeResponse.status()} ${errorText}`);

      const isRetryableEmptyNote =
        summarizeResponse.status() === 400 && errorText.includes('Note content is empty');
      if (!isRetryableEmptyNote || attempt === 3) {
        expect(summarizeResponse.ok(), `Summarize failed: ${summarizeResponse.status()} ${errorText}`).toBeTruthy();
      }

      await page.waitForTimeout(2000 * attempt);
    }

    expect(summarizeSucceeded).toBeTruthy();

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
    const aiResponse = aiMessages.first();
    await expect(aiResponse).toBeVisible({ timeout: 100000 });
    console.log('[E2E] AI message content found');


    // 5. Chat
    console.log('[E2E] Sending chat message');
    const assistantMessagesBeforeChat = await aiMessages.count();
    const chatInput = layout.getByPlaceholder(/Ask about current note|現在のノートについて質問/i).first();
    await chatInput.fill('What is this note about?');
    // Click send button for more reliability across devices
    await layout.getByTestId('ai-chat-send-button').click();

    await expect(aiMessages).toHaveCount(assistantMessagesBeforeChat + 1, { timeout: 30000 });
    await expect(aiMessages.last()).toContainText(/Playwright|note/i, { timeout: 30000 });
  });

  test('should be able to search and filter notes', async ({ page, isMobile }) => {
    test.setTimeout(120000);
    const searchNoteTitle = `Searchable Note ${Date.now()}`;
    const searchNoteContent = 'Content for search test';

    await page.goto('/');
    console.log('[E2E] Starting Search Test');
    await createNoteFixture(page, { title: searchNoteTitle, content: searchNoteContent });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 1. First click on "All Notes" to ensure we're in the right view
    // On mobile, ensure we are in Folders view first so we can click "All Notes" in the sidebar
    if (isMobile) {
      // Switch to Folders view first
      await page.getByTestId('mobile-nav-folders').click();
      // Now mobile-layout-folders should be visible
      await expect(page.getByTestId('mobile-layout-folders')).toBeVisible();
    }
    // Select "All Notes"
    const sidebar = isMobile ? page.getByTestId('mobile-layout-folders') : page.getByTestId('desktop-layout');
    await sidebar.getByTestId('sidebar-nav-all-notes').click();
    await page.waitForTimeout(500);

    // Go to Note List to search (Mobile check)
    // On Desktop, Note List is always visible, but good to ensure we check it.
    if (isMobile) {
      console.log('[E2E] Switching to Notes view');
      console.log('[E2E] Switching to Notes view');
      await page.getByTestId('mobile-nav-notes').click();
      // Verify we are in the notes view (check visibility of notes layout)
      await expect(page.getByTestId('mobile-layout-notes')).toBeVisible();
    }

    // 2.5 Verify Note Title Update in List BEFORE Search
    console.log('[E2E] Verifying note title updated in list before search');


    // Note list should update after save - wait for it to appear
    // On desktop, note list is always visible on the left side
    // Give more time for the list to update after creation and save
    await page.waitForTimeout(3000);

    // First check if the note appears in the list (may take time for API sync)
    const listLayout = isMobile ? page.getByTestId('mobile-layout-notes') : page.getByTestId('desktop-layout');
    const noteInList = listLayout.locator('[data-testid^="note-list-item-"]').filter({ hasText: searchNoteTitle }).first();
    try {
      await expect(noteInList).toBeVisible({ timeout: 30000 });
    } catch {
      // If not found, reload the page and try again
      console.log('[E2E] Note not found in list, reloading page...');
      await page.reload();
      await page.waitForLoadState('networkidle');
      // Click All Notes again after reload
      const sidebarContainer = isMobile ? page.getByTestId('mobile-layout-folders') : page.getByTestId('desktop-layout');
      await sidebarContainer.getByTestId('sidebar-nav-all-notes').click().catch(() => { });
      await page.waitForTimeout(1000);
      await expect(noteInList).toBeVisible({ timeout: 60000 });
    }

    // 3. Perform Search
    console.log(`[E2E] Searching for: ${searchNoteTitle}`);
    const searchInput = listLayout.getByTestId('note-list-search-input');
    await expect(searchInput).toBeVisible({ timeout: 15000 });
    await searchInput.fill(searchNoteTitle);

    // 4. Verify result contains the note
    console.log('[E2E] Verifying search results');
    // We check if the text is visible. 
    // We filter by `button` to ensure we are looking at the list item and not some other element.
    // And we ensure it is visible.
    const resultItem = listLayout.locator('[data-testid^="note-list-item-"]').filter({ hasText: searchNoteTitle }).first();
    await expect(resultItem).toBeVisible({ timeout: 10000 });

    // 5. Verify negative search
    console.log('[E2E] Negative search test');
    await searchInput.fill(`Non-existent ${Date.now()}`);
    await expect(listLayout.getByText(/No results found|ノートがありません/i).first()).toBeVisible({ timeout: 10000 });

    // Clear search
    await searchInput.fill('');
  });

  test('should open settings and display correct content', async ({ page, isMobile, browserName }) => {
    if (browserName === 'webkit') test.skip(); // Flaky on WebKit
    await page.goto('/');
    console.log('[E2E] Starting Settings Test');

    // 1. Open Settings
    // On mobile, settings button is in the Footer of the Sidebar (Folders view)
    if (isMobile) {
      // Ensure we are in Folders view
      await page.getByTestId('mobile-nav-folders').click();
      await expect(page.getByTestId('mobile-layout-folders')).toBeVisible();
    }

    console.log('[E2E] Opening Settings dialog');
    // Settings icon button has title="Settings"
    await page.getByRole('button', { name: 'Settings' }).first().click();
    const settingsDialog = page.getByRole('dialog');

    // 2. Verify Dialog Content
    console.log('[E2E] Verifying Settings content');
    // Title
    await expect(settingsDialog.getByRole('heading', { name: /^Settings$|^設定$/i })).toBeVisible({ timeout: 10000 });

    // Language Selection
    await expect(settingsDialog.locator('#language-select')).toBeVisible();

    // AI Model Selection
    await expect(settingsDialog.locator('#model-select')).toBeVisible();

    // Export button
    await expect(settingsDialog.getByRole('button', { name: /Download ZIP|ZIPをダウンロード/i })).toBeVisible();

    // 3. Close Settings
    console.log('[E2E] Closing Settings');
    // Hit Escape to reliably close the dialog without scroll/viewport issues
    await page.keyboard.press('Escape');

    // Verify dialog is gone
    await expect(settingsDialog).not.toBeVisible({ timeout: 10000 });
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
    // Explicitly target desktop layout for this desktop-only test
    const desktopLayout = page.getByTestId('desktop-layout');
    const collapseButton = desktopLayout.getByTestId('note-list-collapse-button');
    await expect(collapseButton).toBeVisible({ timeout: 5000 });
    await collapseButton.click();

    // 3. Verify note list is collapsed (heading should be hidden)
    console.log('[E2E] Verifying note list is collapsed');
    await expect(noteListHeading).not.toBeVisible({ timeout: 5000 });

    // 4. Find and click the expand button
    console.log('[E2E] Clicking expand button');
    const expandButton = desktopLayout.getByTestId('note-list-expand-button');
    await expect(expandButton).toBeVisible({ timeout: 5000 });
    await expandButton.click();

    // 5. Verify note list is expanded again
    console.log('[E2E] Verifying note list is expanded again');
    await expect(noteListHeading).toBeVisible({ timeout: 5000 });
  });

  test('should save note offline and show sync status indicator', async ({ page, context, isMobile, browserName }) => {
    test.setTimeout(120000); // Offline test involves multiple reloads and waits
    const layout = isMobile ? page.getByTestId('mobile-layout-editor') : page.getByTestId('desktop-layout');
    const onlineNoteTitle = `Online Note ${Date.now()}`;
    const initialContent = 'Content created while online';
    const contentInput = layout.getByTestId('editor-content-input');

    await page.goto('/');
    console.log('[E2E] Starting Offline Sync Test');
    await createNoteFixture(page, { title: onlineNoteTitle, content: initialContent });
    await page.reload();
    await page.waitForLoadState('networkidle');

    if (isMobile) {
      await page.getByTestId('mobile-nav-folders').click();
    }
    const sidebar = isMobile ? page.getByTestId('mobile-layout-folders') : page.getByTestId('desktop-layout');
    await sidebar.getByTestId('sidebar-nav-all-notes').click();
    await page.waitForTimeout(1000);

    const noteList = isMobile ? page.getByTestId('mobile-layout-notes') : page.getByTestId('desktop-layout');
    const existingNoteItem = noteList.locator('[data-testid^="note-list-item-"]').filter({ hasText: onlineNoteTitle }).first();
    await expect(existingNoteItem).toBeVisible({ timeout: 30000 });
    await existingNoteItem.click();
    await expect(layout.getByTestId('editor-title-input')).toHaveValue(onlineNoteTitle, { timeout: 30000 });
    await expect(contentInput).toHaveValue(initialContent, { timeout: 30000 });


    // 2. Go offline
    console.log('[E2E] Going offline');
    await context.setOffline(true);

    // 3. Edit the note while offline
    console.log('[E2E] Editing note while offline');
    const offlineContent = 'Content edited while offline - ' + Date.now();
    await contentInput.clear();
    await contentInput.fill(offlineContent);
    await contentInput.blur();

    // 4. Wait a moment for the local save to process
    await page.waitForTimeout(2000);

    // 5. Verify offline indicator appears (either in status bar or floating indicator)
    console.log('[E2E] Verifying offline status');
    console.log('[E2E] Verifying offline status');
    // Check for "Offline" status indicator - look for the sync status element
    const editorLayout = isMobile ? page.getByTestId('mobile-layout-editor') : page.getByTestId('desktop-layout');
    const statusContainer = editorLayout.getByTestId('sync-status');
    await expect(statusContainer).toBeVisible({ timeout: 10000 });

    // On desktop, verify text to ensure we are truly in offline/unsaved state
    // On mobile the text is hidden so we skip text verification or would need to check class/color
    if (!isMobile) {
      await expect(statusContainer).toHaveText(/Offline|オフライン|Saved locally|ローカルに保存|Unsaved|未保存/i, { timeout: 10000 });
    }

    // 6. Go back online
    console.log('[E2E] Going back online');
    await context.setOffline(false);

    // 7. Wait for queue processing after the online event.
    console.log('[E2E] Waiting for sync');
    await page.waitForTimeout(5000);

    // 8. Reload page to verify data persisted after the queued sync.
    console.log('[E2E] Reloading page to verify persistence');
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Verify the note content is still there
    // Verify the note content is still there
    // On mobile, to see "All Notes", we must be in Folders view
    if (isMobile) {
      await page.getByTestId('mobile-nav-folders').click();
    }
    // Select All Notes after reload to ensure we can see the note
    const sidebarRel = isMobile ? page.getByTestId('mobile-layout-folders') : page.getByTestId('desktop-layout');
    await sidebarRel.getByTestId('sidebar-nav-all-notes').click();
    await page.waitForTimeout(1000);

    // Look for the note in the list - use text search in the list container
    console.log(`[E2E] Looking for note: ${onlineNoteTitle}`);
    const listLayout = isMobile ? page.getByTestId('mobile-layout-notes') : page.getByTestId('desktop-layout');
    const noteItem = listLayout.locator('[data-testid^="note-list-item-"]').filter({ hasText: onlineNoteTitle }).first();

    try {
      await expect(noteItem).toBeVisible({ timeout: 40000 });
    } catch {
      console.log('[E2E] Note not found after reload, retrying reload...');
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      if (isMobile) {
        await page.getByTestId('mobile-nav-notes').click();
      }
      const sidebarRetry = isMobile ? page.getByTestId('mobile-layout-folders') : page.getByTestId('desktop-layout');
      await sidebarRetry.getByTestId('sidebar-nav-all-notes').click().catch(() => { });
      await expect(noteItem).toBeVisible({ timeout: 40000 });
    }

    await noteItem.click();

    const reloadedLayout = isMobile ? page.getByTestId('mobile-layout-editor') : page.getByTestId('desktop-layout');
    await expect(reloadedLayout.getByTestId('editor-title-input')).toHaveValue(onlineNoteTitle, { timeout: 20000 });
    await expect(reloadedLayout.getByTestId('editor-content-input')).toHaveValue(offlineContent, { timeout: 20000 });
  });
});
