import { test, expect } from '@playwright/test';

import {
  createNoteFixture,
  deleteNoteFixture,
  getNoteFixture,
  waitForWorkspaceSnapshotReady,
} from '../helpers/apiFixtures';

const SNAPSHOT_WARMUP = { attempts: 12, delayMs: 5000, timeoutMs: 30000 };

test.describe('Regression: AI Edit (#78 / #79 contentOverride scope)', () => {
  // AI responses are slow and flaky on WebKit; chromium only
  test.skip(({ browserName }) => browserName === 'webkit');
  test.skip(({ isMobile }) => isMobile, 'AI Edit UI is desktop-only');

  test('should show diff view and accept edit — persisting new content', async ({ page }) => {
    test.setTimeout(180000);

    const noteTitle = `regression-ai-edit-${Date.now()}`;
    const originalContent = 'This sentence needs improvement. It is a test.';

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
    await expect(layout.getByTestId('editor-title-input')).toHaveValue(noteTitle, { timeout: 20000 });

    // Open AI chat panel
    await layout.getByTestId('editor-chat-button').click();

    // Switch to Edit mode
    const modeToggle = layout.getByTestId('mode-toggle');
    await expect(modeToggle).toBeVisible({ timeout: 10000 });
    await layout.getByTestId('mode-toggle-edit').click();

    // Send an edit instruction
    const chatInput = layout.getByPlaceholder(/Describe the edit|編集内容を説明/i).first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill('Make this text more formal and concise.');

    const editResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/ai/edit') && resp.status() < 400,
      { timeout: 60000 }
    );
    await layout.getByTestId('ai-chat-send-button').click();
    await editResponsePromise;

    // Wait for diff view to appear in the editor area
    const diffPanel = layout.getByTestId('editor-diff-panel');
    await expect(diffPanel).toBeVisible({ timeout: 60000 });

    const diffView = diffPanel.getByTestId('diff-view');
    await expect(diffView).toBeVisible({ timeout: 10000 });

    // Accept the edit
    const acceptButton = diffPanel.getByTestId('diff-accept-button');
    await expect(acceptButton).toBeVisible({ timeout: 10000 });
    await acceptButton.click();

    // After accepting, the diff panel should collapse and the editor re-appear
    await expect(diffPanel).not.toBeVisible({ timeout: 15000 });
    await expect(layout.getByTestId('editor-content-input')).toBeVisible({ timeout: 10000 });

    // Verify the note content changed (was updated to the edited version)
    const updatedNote = await getNoteFixture(page, note.id);
    expect(updatedNote.content).not.toBe(originalContent);
    expect(updatedNote.content.trim().length).toBeGreaterThan(0);

    await deleteNoteFixture(page, note.id);
  });

  test('should reject edit — leaving original content unchanged', async ({ page }) => {
    test.setTimeout(180000);

    const noteTitle = `regression-ai-reject-${Date.now()}`;
    const originalContent = 'Original content that should not change after rejection.';

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
    await expect(layout.getByTestId('editor-title-input')).toHaveValue(noteTitle, { timeout: 20000 });

    // Mock the async edit-jobs API to avoid slow Lambda/Bedrock calls.
    // The reject flow only verifies the UI rejects and leaves content unchanged;
    // the actual AI output quality is irrelevant here.
    await page.route('**/api/ai/edit-jobs', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            job: {
              id: 'mock-reject-job',
              status: 'completed',
              edited_content: 'Mocked rewritten content for reject test.',
              tokens_used: 10,
              error_message: null,
              note_id: null,
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await layout.getByTestId('editor-chat-button').click();
    await expect(layout.getByTestId('mode-toggle')).toBeVisible({ timeout: 10000 });
    await layout.getByTestId('mode-toggle-edit').click();

    const chatInput = layout.getByPlaceholder(/Describe the edit|編集内容を説明/i).first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill('Rewrite this note completely.');

    const editResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/ai/edit-jobs') && resp.request().method() === 'POST' && resp.status() < 400,
      { timeout: 10000 }
    );
    await layout.getByTestId('ai-chat-send-button').click();
    await editResponsePromise;

    const diffPanel = layout.getByTestId('editor-diff-panel');
    await expect(diffPanel).toBeVisible({ timeout: 15000 });

    // Reject the edit
    const rejectButton = diffPanel.getByTestId('diff-reject-button');
    await expect(rejectButton).toBeVisible({ timeout: 10000 });
    await rejectButton.click();

    await expect(diffPanel).not.toBeVisible({ timeout: 15000 });

    // Content must remain the original
    const noteAfterReject = await getNoteFixture(page, note.id);
    expect(noteAfterReject.content).toBe(originalContent);

    await deleteNoteFixture(page, note.id);
  });

  test('should not corrupt Note B when switching notes during AI Edit of Note A (#79)', async ({ page }) => {
    test.setTimeout(180000);

    const noteTitleA = `regression-ai-cross-A-${Date.now()}`;
    const noteTitleB = `regression-ai-cross-B-${Date.now()}`;
    const contentA = 'Note A content to be edited by AI.';
    const contentB = 'Note B content that must not be touched.';

    await page.goto('/');
    const noteA = await createNoteFixture(page, { title: noteTitleA, content: contentA });
    const noteB = await createNoteFixture(page, { title: noteTitleB, content: contentB });

    await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    const layout = page.getByTestId('desktop-layout');
    await layout.getByTestId('sidebar-nav-all-notes').click();

    // Open Note A
    const noteAItem = layout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitleA }).first();
    await expect(noteAItem).toBeVisible({ timeout: 30000 });
    await noteAItem.click();
    await expect(layout.getByTestId('editor-title-input')).toHaveValue(noteTitleA, { timeout: 20000 });

    await layout.getByTestId('editor-chat-button').click();
    await expect(layout.getByTestId('mode-toggle')).toBeVisible({ timeout: 10000 });
    await layout.getByTestId('mode-toggle-edit').click();

    const chatInput = layout.getByPlaceholder(/Describe the edit|編集内容を説明/i).first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill('Improve this text slightly.');
    await layout.getByTestId('ai-chat-send-button').click();

    // While AI is responding, switch to Note B (#79 regression scenario)
    const noteBItem = layout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitleB }).first();
    await expect(noteBItem).toBeVisible({ timeout: 15000 });
    await noteBItem.click();
    await expect(layout.getByTestId('editor-title-input')).toHaveValue(noteTitleB, { timeout: 20000 });

    // Wait for AI Edit on Note A to complete (response may arrive after switch)
    await page.waitForTimeout(10000);

    // Note B content must be intact
    const noteBAfter = await getNoteFixture(page, noteB.id);
    expect(noteBAfter.content, 'Note B must not be corrupted by Note A AI Edit (contentOverride scope bug)').toBe(contentB);

    // Note A's content may or may not have been updated — either is fine as long as B is safe
    await deleteNoteFixture(page, noteA.id);
    await deleteNoteFixture(page, noteB.id);
  });
});
