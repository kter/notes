import { test, expect } from '@playwright/test';

import {
  createFolderFixture,
  createNoteFixture,
  deleteFolderFixture,
  deleteNoteFixture,
  waitForWorkspaceSnapshotReady,
} from '../helpers/apiFixtures';

const SNAPSHOT_WARMUP = { attempts: 12, delayMs: 5000, timeoutMs: 30000 };

test.describe('Regression: URL State Sync (#82)', () => {
  test.skip(({ isMobile }) => isMobile, 'URL sync is desktop-only');

  test('should reflect selected folder and note in URL query params', async ({ page }) => {
    test.setTimeout(120000);

    const folderName = `regression-url-sync-folder-${Date.now()}`;
    const noteTitle = `regression-url-sync-note-${Date.now()}`;

    await page.goto('/');
    const folder = await createFolderFixture(page, folderName);
    const note = await createNoteFixture(page, {
      title: noteTitle,
      content: 'url sync regression test',
      folder_id: folder.id,
    });

    await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const layout = page.getByTestId('desktop-layout');

    const folderItem = layout.getByTestId(`sidebar-folder-item-${folder.id}`);
    await expect(folderItem).toBeVisible({ timeout: 30000 });
    await folderItem.click();

    const noteItem = layout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await expect(noteItem).toBeVisible({ timeout: 30000 });
    await noteItem.click();

    await expect(layout.getByTestId('editor-title-input')).toHaveValue(noteTitle, { timeout: 20000 });

    await expect(page).toHaveURL(new RegExp(`folder=${folder.id}`), { timeout: 10000 });
    await expect(page).toHaveURL(new RegExp(`note=${note.id}`), { timeout: 5000 });

    // Reload: both params must survive
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await expect(layout.getByTestId('editor-title-input')).toHaveValue(noteTitle, { timeout: 30000 });
    await expect(page).toHaveURL(new RegExp(`folder=${folder.id}`));
    await expect(page).toHaveURL(new RegExp(`note=${note.id}`));

    await deleteNoteFixture(page, note.id);
    await deleteFolderFixture(page, folder.id);
  });

  test('should restore folder-only selection on reload', async ({ page }) => {
    test.setTimeout(120000);

    const folderName = `regression-url-folder-only-${Date.now()}`;

    await page.goto('/');
    const folder = await createFolderFixture(page, folderName);

    await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const layout = page.getByTestId('desktop-layout');

    const folderItem = layout.getByTestId(`sidebar-folder-item-${folder.id}`);
    await expect(folderItem).toBeVisible({ timeout: 30000 });
    await folderItem.click();

    await expect(page).toHaveURL(new RegExp(`folder=${folder.id}`), { timeout: 10000 });
    expect(page.url()).not.toMatch(/[?&]note=/);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await expect(layout.getByTestId(`sidebar-folder-item-${folder.id}`)).toBeVisible({ timeout: 30000 });
    await expect(page).toHaveURL(new RegExp(`folder=${folder.id}`));

    await deleteFolderFixture(page, folder.id);
  });

  test('should clear note param when switching to a different folder', async ({ page }) => {
    test.setTimeout(120000);

    const folderAName = `regression-url-folderA-${Date.now()}`;
    const folderBName = `regression-url-folderB-${Date.now()}`;
    const noteTitle = `regression-url-clear-note-${Date.now()}`;

    await page.goto('/');
    const folderA = await createFolderFixture(page, folderAName);
    const folderB = await createFolderFixture(page, folderBName);
    const note = await createNoteFixture(page, {
      title: noteTitle,
      content: 'note in folder A',
      folder_id: folderA.id,
    });

    await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const layout = page.getByTestId('desktop-layout');

    const folderAItem = layout.getByTestId(`sidebar-folder-item-${folderA.id}`);
    await expect(folderAItem).toBeVisible({ timeout: 30000 });
    await folderAItem.click();

    const noteItem = layout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await expect(noteItem).toBeVisible({ timeout: 30000 });
    await noteItem.click();
    await expect(page).toHaveURL(new RegExp(`note=${note.id}`), { timeout: 10000 });

    // Switch to folder B: note param should be removed from URL
    const folderBItem = layout.getByTestId(`sidebar-folder-item-${folderB.id}`);
    await expect(folderBItem).toBeVisible({ timeout: 15000 });
    await folderBItem.click();

    await expect(page).toHaveURL(new RegExp(`folder=${folderB.id}`), { timeout: 10000 });

    await deleteNoteFixture(page, note.id);
    await deleteFolderFixture(page, folderA.id);
    await deleteFolderFixture(page, folderB.id);
  });
});
