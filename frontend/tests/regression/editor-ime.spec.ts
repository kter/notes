import { test, expect } from '@playwright/test';

import {
  createNoteFixture,
  deleteNoteFixture,
  getNoteFixture,
  waitForWorkspaceSnapshotReady,
  waitForNoteContentFixture,
} from '../helpers/apiFixtures';
import { waitForWorkspaceChange } from '../helpers/workspaceSync';

const SNAPSHOT_WARMUP = { attempts: 12, delayMs: 5000, timeoutMs: 30000 };

test.describe('Regression: Editor IME and CodeMirror keyboard behavior', () => {
  test.skip(({ isMobile }) => isMobile, 'Editor keyboard tests are desktop-only');
  // WebKit has known differences in composition event handling
  // and caret-color CSS behaviour; run on chromium only.

  test('should insert Japanese text without duplication (IME regression)', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const noteTitle = `regression-ime-${Date.now()}`;
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

    const contentInput = layout.getByTestId('editor-content-input');
    await expect(contentInput).toBeVisible({ timeout: 20000 });
    await contentInput.click();

    // insertText bypasses key-by-key and dispatches a single input event — closest to IME commit
    await page.keyboard.insertText('日本語テスト');

    // Wait for the text to appear; it must appear exactly once (no duplication)
    await expect(contentInput).toContainText('日本語テスト', { timeout: 10000 });

    const rawContent = await contentInput.innerText();
    const count = (rawContent.match(/日本語テスト/g) ?? []).length;
    expect(count, 'Japanese text must appear exactly once — IME duplication regression').toBe(1);

    // Persist and verify via API
    await contentInput.blur();
    await waitForNoteContentFixture(page, note.id, '日本語テスト', 30000);

    await deleteNoteFixture(page, note.id);
  });

  test('should continue a markdown list on Enter (markdownListContinuation extension)', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const noteTitle = `regression-list-enter-${Date.now()}`;
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

    const contentInput = layout.getByTestId('editor-content-input');
    await contentInput.click();

    // Type first list item and press Enter
    await page.keyboard.type('- First item');
    await page.keyboard.press('Enter');
    // The extension should insert `- ` automatically
    await page.keyboard.type('Second item');
    await page.keyboard.press('Enter');
    // Enter on non-empty second item → third continuation
    await page.keyboard.type('Third item');

    const expectedContent = '- First item\n- Second item\n- Third item';
    await expect(contentInput).toContainText('First item', { timeout: 5000 });
    await expect(contentInput).toContainText('Second item', { timeout: 5000 });
    await expect(contentInput).toContainText('Third item', { timeout: 5000 });

    // Save and verify list markers survived round-trip
    const updateWaiter = waitForWorkspaceChange(page, 'note', 'update', 30000);
    await contentInput.blur();
    await updateWaiter;
    await waitForNoteContentFixture(page, note.id, expectedContent, 30000);

    await deleteNoteFixture(page, note.id);
  });

  test('should not add list markers to non-list lines (exit-on-empty regression)', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    // Create a note whose content already has the correct post-exit-on-empty shape:
    // a list item followed by a blank line and then plain text.
    // This verifies the extension does NOT corrupt non-list lines when the editor
    // loads and the user makes further edits — the unit test covers the keyboard path.
    const noteTitle = `regression-list-exit-${Date.now()}`;
    const originalContent = '- Item 1\n\nNormal text after list';
    await page.goto('/');
    const note = await createNoteFixture(page, { title: noteTitle, content: originalContent });

    await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const layout = page.getByTestId('desktop-layout');
    await layout.getByTestId('sidebar-nav-all-notes').click();

    const noteItem = layout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await expect(noteItem).toBeVisible({ timeout: 30000 });
    await noteItem.click();

    const contentInput = layout.getByTestId('editor-content-input');
    await expect(contentInput).toContainText('Normal text after list', { timeout: 20000 });

    // Verify the loaded content does NOT have a `- ` prefix on "Normal text"
    const displayed = await contentInput.innerText();
    expect(displayed).not.toMatch(/- Normal text/);

    // Also verify the editor can save the content without corrupting it
    await contentInput.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' extra');

    const saveWaiter = waitForWorkspaceChange(page, 'note', 'update', 30000);
    await contentInput.blur();
    await saveWaiter;

    const savedNote = await getNoteFixture(page, note.id);
    expect(savedNote.content).toContain('Normal text after list extra');
    expect(savedNote.content).not.toMatch(/- Normal text/);

    await deleteNoteFixture(page, note.id);
  });

  test('should not misplace Japanese IME input when next line also has a bullet (Issue #89)', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const noteTitle = `regression-ime-bullet-${Date.now()}`;
    // Start with two bullet lines; cursor will go on the first line
    const initialContent = '- existing\n- ';
    await page.goto('/');
    const note = await createNoteFixture(page, { title: noteTitle, content: initialContent });

    await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const layout = page.getByTestId('desktop-layout');
    await layout.getByTestId('sidebar-nav-all-notes').click();

    const noteItem = layout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await expect(noteItem).toBeVisible({ timeout: 30000 });
    await noteItem.click();

    const contentInput = layout.getByTestId('editor-content-input');
    await expect(contentInput).toBeVisible({ timeout: 20000 });

    // Switch to live-preview mode (bug only manifests there)
    const toggleButton = layout.getByTestId('editor-display-mode-toggle');
    await toggleButton.click();
    await page.waitForTimeout(300);

    // Place cursor at end of first line ("- existing")
    // Control+Home jumps to absolute beginning of doc, then End moves to end of line 1
    await contentInput.click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('End');

    // insertText simulates IME commit for a Japanese string
    await page.keyboard.insertText('日本語');

    // The Japanese text must appear on the first bullet line, not drift to another line
    const rawContent = await contentInput.innerText();
    const lines = rawContent.split('\n').map((l) => l.trim());

    // First line should contain both the original text and the inserted Japanese
    expect(lines[0], 'IME text must stay on the first bullet line').toContain('existing');
    expect(lines[0], 'IME text must stay on the first bullet line').toContain('日本語');

    // Japanese text must NOT appear on any other line
    const leakedToOtherLine = lines.slice(1).some((l) => l.includes('日本語'));
    expect(leakedToOtherLine, 'IME text must not leak to other lines').toBe(false);

    // Persist and verify via API — exact content after IME commit on line 1
    const expectedSaved = '- existing日本語\n- ';
    await contentInput.blur();
    await waitForNoteContentFixture(page, note.id, expectedSaved, 30000);
    const savedNote = await getNoteFixture(page, note.id);
    // The saved content must have Japanese on the first line only
    const savedLines = savedNote.content.split('\n');
    expect(savedLines[0]).toContain('日本語');
    const savedLeaked = savedLines.slice(1).some((l: string) => l.includes('日本語'));
    expect(savedLeaked, 'saved content must not have Japanese on other lines').toBe(false);

    await deleteNoteFixture(page, note.id);
  });
});
