import { test, expect } from '@playwright/test';

import { createFolderFixture, createNoteFixture } from './helpers/apiFixtures';

test.describe('Sharing Functionality', () => {
  test('should perform full share cycle', async ({ page, context, isMobile }) => {
    test.setTimeout(90000);

    const folderName = `Share Test Folder ${Date.now()}`;
    const noteTitle = `Shared Note ${Date.now()}`;
    const noteContent = '# Hello World\n\nThis is a shared note for E2E testing.\n\n- Item 1\n- Item 2';

    await page.goto('/');
    console.log('[Share E2E] Starting share test');
    const createdFolder = await createFolderFixture(page, folderName);
    await createNoteFixture(page, {
      title: noteTitle,
      content: noteContent,
      folder_id: createdFolder.id,
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Select the folder
    console.log(`[Share E2E] Created folder: ${folderName}`);
    const sidebar = isMobile ? page.getByTestId('mobile-layout-folders') : page.getByTestId('desktop-layout');
    const folderButton = sidebar.getByTestId(`sidebar-folder-item-${createdFolder.id}`);
    await expect(folderButton).toBeVisible({ timeout: 15000 });
    await folderButton.click();

    const noteList = isMobile ? page.getByTestId('mobile-layout-notes') : page.getByTestId('desktop-layout');
    const existingNoteItem = noteList.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await expect(existingNoteItem).toBeVisible({ timeout: 30000 });
    await existingNoteItem.click();
    console.log('[Share E2E] Note ready');

    // Wait for editor. On mobile, note creation can leave the view on the list,
    // so open the created note explicitly if the editor is not visible yet.
    const layout = isMobile ? page.getByTestId('mobile-layout-editor') : page.getByTestId('desktop-layout');
    const titleInput = layout.getByTestId('editor-title-input');
    const contentTextarea = layout.getByTestId('editor-content-input');

    if (isMobile) {
      try {
        await expect(titleInput).toBeVisible({ timeout: 5000 });
      } catch {
        await expect(existingNoteItem).toBeVisible({ timeout: 15000 });
        await existingNoteItem.click();
        await expect(titleInput).toBeVisible({ timeout: 20000 });
      }
    } else {
      await expect(titleInput).toBeVisible({ timeout: 20000 });
    }
    await expect(titleInput).toHaveValue(noteTitle, { timeout: 30000 });
    await expect(contentTextarea).toHaveValue(noteContent, { timeout: 30000 });

    // Click the Share button
    console.log('[Share E2E] Opening share dialog');
    const shareButton = layout.getByTestId('editor-share-button');
    await expect(shareButton).toBeVisible({ timeout: 10000 });
    await shareButton.click();

    // Wait for share dialog to appear
    const shareDialog = page.getByTestId('share-dialog');
    await expect(shareDialog).toBeVisible({ timeout: 5000 });
    console.log('[Share E2E] Share dialog opened');

    // Click create share link button
    const createShareButton = page.getByTestId('share-create-button');
    await expect(createShareButton).toBeVisible({ timeout: 5000 });

    // Listen for the share API call
    const sharePromise = page.waitForResponse(
      resp => resp.url().includes('/share') && resp.request().method() === 'POST' && resp.status() < 400,
      { timeout: 15000 }
    );

    await createShareButton.click();
    console.log('[Share E2E] Creating share link');

    await sharePromise;
    console.log('[Share E2E] Share link created');

    // Verify URL input appears
    const urlInput = page.getByTestId('share-url-input');
    await expect(urlInput).toBeVisible({ timeout: 5000 });

    // Get the share URL
    const shareUrl = await urlInput.inputValue();
    console.log(`[Share E2E] Share URL: ${shareUrl}`);
    expect(shareUrl).toContain('/shared?token=');

    // Copy button should work
    const copyButton = page.getByTestId('share-copy-button');
    await expect(copyButton).toBeVisible();

    // Close the dialog by clicking outside or pressing escape
    await page.keyboard.press('Escape');

    // Open a new page to test the shared link (simulating unauthenticated access)
    console.log('[Share E2E] Testing shared link access');
    const sharedPage = await context.newPage();

    // Clear auth state for the new page to simulate unauthenticated user
    await sharedPage.context().clearCookies();

    // Navigate to the shared URL
    await sharedPage.goto(shareUrl);
    console.log('[Share E2E] Navigated to shared URL');

    // Verify the shared note page displays correctly
    await expect(sharedPage.getByText('Read-only')).toBeVisible();
    await expect(sharedPage.getByText(noteTitle).first()).toBeVisible({ timeout: 10000 });

    // Verify content is rendered
    await expect(sharedPage.getByText('Hello World')).toBeVisible();
    await expect(sharedPage.getByText('This is a shared note for E2E testing.')).toBeVisible();

    console.log('[Share E2E] Shared note displayed correctly');
    await sharedPage.close();

    // Test revoking the share
    console.log('[Share E2E] Testing share revocation');

    // Re-open share dialog
    await shareButton.click();
    await expect(shareDialog).toBeVisible({ timeout: 5000 });

    // Click revoke button
    const revokeButton = page.getByTestId('share-revoke-button');
    await expect(revokeButton).toBeVisible();

    // Handle the confirmation dialog
    page.once('dialog', dialog => dialog.accept());

    const deletePromise = page.waitForResponse(
      resp => resp.url().includes('/share') && resp.request().method() === 'DELETE' && resp.status() < 400,
      { timeout: 15000 }
    );

    await revokeButton.click();
    await deletePromise;
    console.log('[Share E2E] Share revoked');

    // Verify the create button appears again (meaning share was removed)
    await expect(page.getByTestId('share-create-button')).toBeVisible({ timeout: 5000 });

    // Verify the old share link no longer works
    const verifyPage = await context.newPage();
    await verifyPage.goto(shareUrl);

    // Should show not found or error
    await expect(verifyPage.getByRole('heading', { name: /not found/i })).toBeVisible({ timeout: 15000 });
    console.log('[Share E2E] Revoked link shows not found');

    await verifyPage.close();
    console.log('[Share E2E] Share test completed successfully');
  });
});
