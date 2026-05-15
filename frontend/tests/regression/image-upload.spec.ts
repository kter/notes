import { test, expect } from '@playwright/test';

import {
  createNoteFixture,
  deleteNoteFixture,
  waitForWorkspaceSnapshotReady,
} from '../helpers/apiFixtures';

const SNAPSHOT_WARMUP = { attempts: 12, delayMs: 5000, timeoutMs: 30000 };

// Minimal 1×1 transparent PNG, base64-encoded
const MINIMAL_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function dropFileOnEditor(
  page: Parameters<typeof waitForWorkspaceSnapshotReady>[0],
  base64: string,
  filename: string,
  mimeType: string,
  sizeBytes?: number
) {
  await page.evaluate(
    ({ b64, name, type, size }) => {
      const el = document.querySelector('[data-testid="editor-drop-zone"]');
      if (!el) throw new Error('editor-drop-zone not found');

      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const buf = size && size > bytes.length
        ? new Uint8Array(size) // fill with zeros to simulate larger file (type is still PNG)
        : bytes;
      const file = new File([buf], name, { type });

      const dt = new DataTransfer();
      dt.items.add(file);

      el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    },
    { b64: base64, name: filename, type: mimeType, size: sizeBytes }
  );
}

test.describe('Regression: Image Upload (disk-quota fix)', () => {
  test.skip(({ isMobile }) => isMobile, 'Image upload via drag-drop is desktop-only');

  test('should upload image and insert markdown link into editor', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const noteTitle = `regression-img-upload-${Date.now()}`;
    await page.goto('/');
    const note = await createNoteFixture(page, { title: noteTitle, content: '' });

    await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const layout = page.getByTestId('desktop-layout');
    await layout.getByTestId('sidebar-nav-all-notes').click();

    const noteItem = layout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await expect(noteItem).toBeVisible({ timeout: 30000 });
    await noteItem.click();
    await expect(layout.getByTestId('editor-title-input')).toHaveValue(noteTitle, { timeout: 20000 });

    const contentInput = layout.getByTestId('editor-content-input');
    await contentInput.click();

    // Mock the image upload API to return a deterministic URL
    await page.route('**/api/images', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://cdn.example.com/regression-test.png' }),
      })
    );

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await dropFileOnEditor(page, MINIMAL_PNG_B64, 'test.png', 'image/png');

    // After upload the markdown link should be injected into the editor
    await expect(contentInput).toContainText('![image](https://cdn.example.com/regression-test.png)', { timeout: 15000 });

    // No console errors during upload (disk quota regression guard)
    const quotaErrors = consoleErrors.filter(
      (e) => /QuotaExceeded|disk quota|storage/i.test(e)
    );
    expect(quotaErrors, 'No disk-quota errors should occur during image upload').toHaveLength(0);

    await deleteNoteFixture(page, note.id);
  });

  test('should reject files over 10 MB with an error message', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const noteTitle = `regression-img-toolarge-${Date.now()}`;
    await page.goto('/');
    const note = await createNoteFixture(page, { title: noteTitle, content: '' });

    await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const layout = page.getByTestId('desktop-layout');
    await layout.getByTestId('sidebar-nav-all-notes').click();

    const noteItem = layout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await expect(noteItem).toBeVisible({ timeout: 30000 });
    await noteItem.click();
    await expect(layout.getByTestId('editor-title-input')).toHaveValue(noteTitle, { timeout: 20000 });

    const contentInput = layout.getByTestId('editor-content-input');
    await contentInput.click();

    // Do NOT mock the API — the file should be rejected client-side before any API call
    const apiCalled = { called: false };
    await page.route('**/api/images', (route) => {
      apiCalled.called = true;
      route.continue();
    });

    // Drop a file just over 10 MB (10 * 1024 * 1024 + 1 bytes)
    const oversizeBytes = 10 * 1024 * 1024 + 1;
    await dropFileOnEditor(page, MINIMAL_PNG_B64, 'huge.png', 'image/png', oversizeBytes);

    // An error message should appear in the editor area
    await expect(page.getByText(/too large|large|サイズ|大きすぎ/i).first()).toBeVisible({ timeout: 10000 });

    // API must NOT have been called (client-side guard)
    await page.waitForTimeout(2000);
    expect(apiCalled.called, 'API must not be called for oversized files').toBe(false);

    // Editor content should not contain any placeholder or image link
    const text = await contentInput.innerText();
    expect(text).not.toContain('![');

    await deleteNoteFixture(page, note.id);
  });
});
