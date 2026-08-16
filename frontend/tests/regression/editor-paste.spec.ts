import { expect, test } from '@playwright/test';

import {
  createNoteFixture,
  deleteNoteFixture,
  waitForNoteContentFixture,
  waitForWorkspaceSnapshotReady,
} from '../helpers/apiFixtures';

const SNAPSHOT_WARMUP = { attempts: 12, delayMs: 5000, timeoutMs: 30000 };

test.describe('Regression: Editor paste behavior', () => {
  test.skip(({ isMobile }) => isMobile, 'Editor clipboard tests are desktop-only');

  test('should ignore one trailing line break when pasting text', async ({
    page,
    browserName,
  }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const noteTitle = `regression-paste-trailing-line-break-${Date.now()}`;
    await page.goto('/');
    const note = await createNoteFixture(page, { title: noteTitle, content: '' });

    try {
      await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');

      const layout = page.getByTestId('desktop-layout');
      await layout.getByTestId('sidebar-nav-all-notes').click();

      const noteItem = layout.getByTestId(`note-list-item-${note.id}`);
      await expect(noteItem).toBeVisible({ timeout: 30000 });
      await noteItem.click();

      const contentInput = layout.getByTestId('editor-content-input');
      await expect(contentInput).toBeVisible({ timeout: 20000 });

      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
        origin: new URL(page.url()).origin,
      });
      await page.evaluate(async (text) => navigator.clipboard.writeText(text), 'pasted line\n');

      await contentInput.click();
      await page.keyboard.press('Control+V');

      await expect(contentInput.locator('.cm-line')).toHaveCount(1);
      await contentInput.blur();
      await waitForNoteContentFixture(page, note.id, 'pasted line', 30000);
    } finally {
      await deleteNoteFixture(page, note.id);
    }
  });
});
