import { test, expect } from '@playwright/test';

import { createNoteFixture } from './helpers/apiFixtures';
import { getAppliedEntityId, waitForWorkspaceChange } from './helpers/workspaceSync';

test.describe('Mobile Comprehensive Scenario', () => {
  // Mobile testing requires isMobile to be true
  test.skip(({ isMobile }) => !isMobile, 'This test is only for mobile viewports');

  test('should navigate through sequential flow on mobile', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip(); // Flaky on Mobile Safari
    test.setTimeout(120000);
    console.log('[Mobile Test] Starting mobile e2e sequence');
    await page.goto('/');

    // 1. Folders View - Create a folder
    console.log('[Mobile Test] Creating folder');
    await expect(page.getByRole('heading', { name: /Folders|フォルダ/i })).toBeVisible({ timeout: 25000 });
    const foldersLayout = page.getByTestId('mobile-layout-folders');
    const createFolderPromise = waitForWorkspaceChange(page, 'folder', 'create');
    await page.getByRole('button', { name: /Add folder|フォルダを追加/i }).click();
    
    const folderName = `Mobile Project ${Date.now()}`;
    await page.getByPlaceholder(/Folder name|フォルダ名/i).fill(folderName);
    await page.keyboard.press('Enter');
    const createdFolderId = await createFolderPromise.then(resp => getAppliedEntityId(resp, 'folder', 'create'));

    // 2. Select Folder
    console.log(`[Mobile Test] Selecting folder: ${folderName}`);
    await foldersLayout.getByTestId(`sidebar-folder-item-${createdFolderId}`).click();
    // Verify transition to Notes view
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(folderName, 'i') })).toBeVisible({ timeout: 20000 });

    // 3. Create Note fixture and open it in the mobile editor
    console.log('[Mobile Test] Creating note fixture');
    const noteTitle = 'Mobile Note';
    const noteContent = 'Content created on a mobile device.';

    const createdNote = await createNoteFixture(page, {
      title: noteTitle,
      content: noteContent,
      folder_id: createdFolderId,
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    const reloadedFoldersLayout = page.getByTestId('mobile-layout-folders');
    await expect(reloadedFoldersLayout.getByTestId(`sidebar-folder-item-${createdFolderId}`)).toBeVisible({ timeout: 20000 });
    await reloadedFoldersLayout.getByTestId(`sidebar-folder-item-${createdFolderId}`).click();
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(folderName, 'i') })).toBeVisible({ timeout: 20000 });

    const notesLayout = page.getByTestId('mobile-layout-notes');
    const noteItem = notesLayout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await expect(noteItem).toBeVisible({ timeout: 20000 });
    await noteItem.click();

    // Wait for editor view elements using placeholder patterns
    const layout = page.getByTestId('mobile-layout-editor');
    const titleInput = layout.getByPlaceholder(/Note title|ノートのタイトル/i).first();
    await expect(titleInput).toBeVisible({ timeout: 20000 });
    await expect(titleInput).toHaveValue(createdNote.title, { timeout: 20000 });
    await expect(
      layout.getByPlaceholder(/Start writing your note|Markdownでノートを書き始め/i).first()
    ).toHaveValue(createdNote.content, { timeout: 20000 });

    // 4. Summarize -> Auto transition to Chat/Summary view
    console.log('[Mobile Test] Summarizing');
    const summarizeButton = layout.getByTestId('editor-summarize-button');
    const aiMessages = page.locator('[data-testid="ai-message-content"]:visible');
    let summarizeSucceeded = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
      await expect(summarizeButton).toBeEnabled({ timeout: 10000 });
      const summarizeResponsePromise = page.waitForResponse(
        resp => resp.url().includes('/api/ai/summarize') && resp.request().method() === 'POST',
        { timeout: 30000 }
      );

      await summarizeButton.scrollIntoViewIfNeeded();
      await summarizeButton.click();
      const summarizeResponse = await summarizeResponsePromise;

      if (summarizeResponse.ok()) {
        summarizeSucceeded = true;
        break;
      }

      const errorText = await summarizeResponse.text().catch(() => '');
      console.log(`[Mobile Test] Summary attempt ${attempt} failed: ${summarizeResponse.status()} ${errorText}`);

      const isRetryableEmptyNote =
        summarizeResponse.status() === 400 && errorText.includes('Note content is empty');
      if (!isRetryableEmptyNote || attempt === 3) {
        expect(summarizeResponse.ok(), `Summarize failed: ${summarizeResponse.status()} ${errorText}`).toBeTruthy();
      }

      await page.waitForTimeout(2000 * attempt);
    }

    expect(summarizeSucceeded).toBeTruthy();
    
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
    const aiResponse = aiMessages.first();
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
