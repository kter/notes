import { test, expect } from '@playwright/test';

import {
  createNoteFixture,
  deleteNoteFixture,
  waitForWorkspaceSnapshotReady,
} from '../helpers/apiFixtures';

const SNAPSHOT_WARMUP = { attempts: 12, delayMs: 5000, timeoutMs: 30000 };
const DISPLAY_MODE_KEY = 'editor-display-mode';

test.describe('Regression: Live-Preview Hybrid Editor (#81)', () => {
  test.skip(({ isMobile }) => isMobile, 'Editor display mode is desktop-only');

  test.beforeEach(async ({ page }) => {
    // Reset display mode to raw so each test starts from a known state
    await page.goto('/');
    await page.evaluate((key) => localStorage.removeItem(key), DISPLAY_MODE_KEY);
  });

  test('should toggle editor display mode and persist in localStorage', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const noteTitle = `regression-live-preview-${Date.now()}`;
    await page.goto('/');
    const note = await createNoteFixture(page, {
      title: noteTitle,
      content: '# Heading\n\n- List item\n\n`code`',
    });

    await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const layout = page.getByTestId('desktop-layout');
    await layout.getByTestId('sidebar-nav-all-notes').click();

    const noteItem = layout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await expect(noteItem).toBeVisible({ timeout: 30000 });
    await noteItem.click();
    await expect(layout.getByTestId('editor-title-input')).toHaveValue(noteTitle, { timeout: 20000 });

    const toggleButton = layout.getByTestId('editor-display-mode-toggle');
    await expect(toggleButton).toBeVisible({ timeout: 10000 });

    // Default mode is 'raw'; aria-label should suggest switching to live-preview (EN or JA)
    const initialLabel = await toggleButton.getAttribute('aria-label');
    expect(initialLabel).toMatch(/live.?preview|ライブプレビュー/i);

    // Toggle to live-preview
    await toggleButton.click();

    // aria-label should now indicate raw-text mode (i.e. user can switch back to raw) — EN or JA
    await expect(toggleButton).toHaveAttribute('aria-label', /raw.?text|source|生テキスト/i, { timeout: 5000 });

    // localStorage must reflect the new mode
    const storedMode = await page.evaluate((key) => localStorage.getItem(key), DISPLAY_MODE_KEY);
    expect(storedMode).toBe('live-preview');

    // Reload and verify the mode is restored from localStorage
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    await layout.getByTestId('sidebar-nav-all-notes').click();
    await expect(noteItem).toBeVisible({ timeout: 30000 });
    await noteItem.click();
    await expect(layout.getByTestId('editor-title-input')).toHaveValue(noteTitle, { timeout: 20000 });

    const toggleAfterReload = layout.getByTestId('editor-display-mode-toggle');
    await expect(toggleAfterReload).toHaveAttribute('aria-label', /raw.?text|source|生テキスト/i, { timeout: 10000 });

    // Toggle back to raw
    await toggleAfterReload.click();
    await expect(toggleAfterReload).toHaveAttribute('aria-label', /live.?preview|ライブプレビュー/i, { timeout: 5000 });

    await deleteNoteFixture(page, note.id);
  });

  test('should toggle preview pane and show/hide editor pane buttons', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const noteTitle = `regression-preview-pane-${Date.now()}`;
    await page.goto('/');
    const note = await createNoteFixture(page, {
      title: noteTitle,
      content: '# Preview Pane Test\n\nThis should render in the preview.',
    });

    await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const layout = page.getByTestId('desktop-layout');
    await layout.getByTestId('sidebar-nav-all-notes').click();

    const noteItem = layout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await expect(noteItem).toBeVisible({ timeout: 30000 });
    await noteItem.click();
    await expect(layout.getByTestId('editor-title-input')).toHaveValue(noteTitle, { timeout: 20000 });

    // Open preview pane
    const previewToggle = layout.getByTestId('editor-preview-toggle');
    await expect(previewToggle).toBeVisible({ timeout: 10000 });
    await previewToggle.click();

    // After opening, the hide-editor button should appear (desktop split mode)
    await expect(layout.getByTestId('editor-hide-button')).toBeVisible({ timeout: 10000 });

    // Hide editor pane (preview-only mode)
    await layout.getByTestId('editor-hide-button').click();
    await expect(layout.getByTestId('editor-show-button')).toBeVisible({ timeout: 10000 });

    // Show editor pane again
    await layout.getByTestId('editor-show-button').click();
    await expect(layout.getByTestId('editor-hide-button')).toBeVisible({ timeout: 10000 });

    // Close preview pane
    await previewToggle.click();
    await expect(layout.getByTestId('editor-hide-button')).not.toBeVisible({ timeout: 10000 });

    await deleteNoteFixture(page, note.id);
  });
});
