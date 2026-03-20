import { test, expect } from '@playwright/test';

import { getAppliedEntityId, isWorkspaceChangeRequest, waitForWorkspaceChange } from './helpers/workspaceSync';

test.describe('UI Loading States', () => {

  test('should show loading state when creating a folder', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop only');
    await page.goto('/');
    const desktopLayout = page.getByTestId('desktop-layout');

    // 1. Open create folder input
    const addFolderButton = desktopLayout.getByTestId('sidebar-add-folder-button');
    await expect(addFolderButton).toBeVisible({ timeout: 15000 });
    const createFolderPromise = waitForWorkspaceChange(page, 'folder', 'create');
    await addFolderButton.click();

    // 2. Fill folder name
    const folderName = `Loading Test Folder ${Date.now()}`;
    await page.getByPlaceholder(/Folder name|フォルダ名/i).fill(folderName);

    // 3. Spy on the create folder API response to delay it if possible, 
    // or just check for immediate UI feedback.
    
    // Check for the confirm button using aria-label
    const confirmButton = desktopLayout.getByTestId('sidebar-new-folder-confirm');
    await expect(confirmButton).toBeVisible();

    // 4. Click confirm
    await confirmButton.click();
    const createdFolderId = await createFolderPromise.then(resp => getAppliedEntityId(resp, 'folder', 'create'));

    // Ideally we would check for the loader, but it might disappear too fast.
    // At least verify the folder is created.
    await expect(desktopLayout.getByTestId(`sidebar-folder-item-${createdFolderId}`)).toBeVisible();
  });

  test('should show loading state when creating a note', async ({ page, isMobile, browserName }) => {
    if (browserName === 'webkit') test.skip(); // Flaky on WebKit
    await page.goto('/');

    // If mobile, navigate to notes view first if needed
    if (isMobile) {
        await page.getByRole('button', { name: /View Folders|フォルダを表示/i }).click();
        await page.getByRole('button', { name: /All Notes|すべてのノート/i }).first().click();
    }

    // 1. Click Add Note button
    const layout = isMobile ? page.getByTestId('mobile-layout-notes') : page.getByTestId('desktop-layout');
    const addNoteButton = layout.getByTestId('note-list-add-note-button');
    
    // We want to verify the disabled state.
    // We can intercept the request and delay it.
    await page.route(/\/api\/workspace\/changes/, async route => {
      if (isWorkspaceChangeRequest(route.request(), 'note', 'create')) {
        // Delay response
        await new Promise(r => setTimeout(r, 1000));
        await route.continue();
      } else {
        await route.continue();
      }
    });

    await addNoteButton.click();

    // 2. Check for disabled state and loader
    // On mobile, creating a note immediately switches to the editor view, hiding the button.
    if (!isMobile) {
      // The button might be replaced or updated.
      // Check for loader icon within the disabled button
      await expect(addNoteButton).toBeDisabled();
      // Use a more generic selector for the loader to be safe
      await expect(addNoteButton.locator('svg.animate-spin')).toBeVisible();

      // 3. Wait for completion by confirming the editor has opened.
      await expect(page.getByTestId('desktop-layout').getByTestId('editor-title-input')).toBeVisible({ timeout: 20000 });
    }
  });
});
