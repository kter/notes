import { test, expect } from '@playwright/test';

import {
  createFolderFixture,
  createNoteFixture,
  deleteFolderFixture,
  deleteNoteFixture,
  waitForWorkspaceSnapshotReady,
} from '../helpers/apiFixtures';

const SNAPSHOT_WARMUP = { attempts: 12, delayMs: 5000, timeoutMs: 30000 };

test.describe('Regression: Print Preview (#49 portrait blank-page)', () => {
  test.skip(({ isMobile }) => isMobile, 'Print preview is desktop-only');

  test('should render non-empty print preview in portrait orientation', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const folderName = `regression-print-folder-${Date.now()}`;
    const noteTitle = `regression-print-note-${Date.now()}`;
    const noteContent = '# Print Test\n\nThis content must appear in the print preview.\n\n- Item 1\n- Item 2\n\n> Block quote for print regression.';

    await page.goto('/');
    const folder = await createFolderFixture(page, folderName);
    const note = await createNoteFixture(page, { title: noteTitle, content: noteContent, folder_id: folder.id });

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

    // Override window.print to prevent the browser print dialog (headless no-op, but explicit)
    await page.evaluate(() => { window.print = () => {}; });

    // Click the print button
    const printButton = layout.getByTestId('editor-print-button');
    await expect(printButton).toBeVisible({ timeout: 10000 });
    await printButton.click();

    // The print preview portal should appear in the DOM
    const printPreview = page.getByTestId('editor-print-preview');
    await expect(printPreview).toBeAttached({ timeout: 10000 });

    // Verify title and content are present (regression: portrait mode was showing blank page)
    await expect(printPreview).toContainText(noteTitle);
    await expect(printPreview).toContainText('Print Test');
    await expect(printPreview).toContainText('This content must appear');

    // Verify the portal is not empty (guard against blank-page regression)
    const innerText = await printPreview.innerText();
    expect(innerText.trim().length).toBeGreaterThan(10);

    // Verify CSS: the print portal should have portrait orientation via @page rule
    // (We can't directly assert @page CSS, but we verify the portal div has the expected class)
    await expect(printPreview).toHaveClass(/note-print-portal/);

    // Cleanup
    await deleteNoteFixture(page, note.id);
    await deleteFolderFixture(page, folder.id);
  });
});
