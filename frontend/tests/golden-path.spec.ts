import { test, expect, type Locator, type Page, type Response } from '@playwright/test';

import {
  createFolderFixture,
  createNoteFixture,
  deleteFolderFixture,
  deleteNoteFixture,
  getNoteFixture,
  waitForNoteContentFixture,
  waitForWorkspaceSnapshotReady,
} from './helpers/apiFixtures';
import { getAppliedEntityId, waitForWorkspaceChange } from './helpers/workspaceSync';

test.describe.configure({ mode: 'serial' });

const SNAPSHOT_RESPONSE_TIMEOUT_MS = 45000;
const SNAPSHOT_WARMUP_OPTIONS = {
  attempts: 12,
  delayMs: 5000,
  timeoutMs: 30000,
};

type CleanupState = {
  folderIds: Set<string>;
  noteIds: Set<string>;
};

function createCleanupState(): CleanupState {
  return {
    folderIds: new Set<string>(),
    noteIds: new Set<string>(),
  };
}

async function getSnapshotFailureDetails(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  return `${response.status()} ${body}`;
}

async function reloadAndWaitForSnapshot(page: Page): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const snapshotPromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/workspace/snapshot') &&
        response.request().method() === 'GET',
      { timeout: SNAPSHOT_RESPONSE_TIMEOUT_MS }
    );

    await page.reload({ waitUntil: 'domcontentloaded' });

    try {
      const response = await snapshotPromise;
      if (response.status() === 200) {
        await page.waitForLoadState('networkidle');
        return;
      }

      const details = await getSnapshotFailureDetails(response);
      lastError = new Error(`Snapshot reload attempt ${attempt} failed: ${details}`);
      console.log(`[Golden Path] ${lastError.message}`);
    } catch (error) {
      lastError = error instanceof Error
        ? error
        : new Error(`Snapshot reload attempt ${attempt} timed out`);
      console.log(`[Golden Path] ${lastError.message}`);
    }

    try {
      await waitForWorkspaceSnapshotReady(page, {
        attempts: 3,
        delayMs: 2000,
        timeoutMs: SNAPSHOT_WARMUP_OPTIONS.timeoutMs,
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error('Workspace snapshot never became ready');
}

async function prepareWorkspaceUi(page: Page): Promise<void> {
  await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP_OPTIONS);
  await reloadAndWaitForSnapshot(page);
}

async function waitForVisibleWithReload(
  page: Page,
  locator: Locator,
  label: string,
  afterReload?: () => Promise<void>
): Promise<void> {
  try {
    await expect(locator).toBeVisible({ timeout: 20000 });
    return;
  } catch {
    console.log(`[Golden Path] ${label} not visible, retrying after snapshot warmup`);
    await prepareWorkspaceUi(page);
    if (afterReload) {
      await afterReload();
    }
    await expect(locator).toBeVisible({ timeout: 45000 });
  }
}

async function expectVisibleSyncStatus(layout: Locator): Promise<void> {
  const syncStatus = layout.getByTestId('sync-status');
  await expect(syncStatus).toBeVisible({ timeout: 60000 });
  await expect(syncStatus).toHaveText(/Saved|保存しました|Saved locally|ローカルに保存/i, {
    timeout: 60000,
  });
}

test.describe('Golden Path: Note Lifecycle', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop-only golden-path tests');

  let cleanupState: CleanupState = createCleanupState();

  const trackFolder = (folderId: string) => cleanupState.folderIds.add(folderId);
  const trackNote = (noteId: string) => cleanupState.noteIds.add(noteId);
  const markFolderDeleted = (folderId: string) => cleanupState.folderIds.delete(folderId);
  const markNoteDeleted = (noteId: string) => cleanupState.noteIds.delete(noteId);

  test.beforeAll(async ({ browser, baseURL }) => {
    test.setTimeout(120000);
    const context = await browser.newContext({
      storageState: 'playwright/.auth/user.json',
    });
    const page = await context.newPage();

    try {
      await page.goto(baseURL ?? '/');
      await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP_OPTIONS);
    } finally {
      await context.close();
    }
  });

  test.beforeEach(async () => {
    cleanupState = createCleanupState();
  });

  test.afterEach(async ({ page }) => {
    if (page.isClosed()) {
      return;
    }

    for (const noteId of cleanupState.noteIds) {
      try {
        await deleteNoteFixture(page, noteId);
      } catch (error) {
        console.log(`[Golden Path] Cleanup note ${noteId} failed: ${String(error)}`);
      }
    }

    for (const folderId of cleanupState.folderIds) {
      try {
        await deleteFolderFixture(page, folderId);
      } catch (error) {
        console.log(`[Golden Path] Cleanup folder ${folderId} failed: ${String(error)}`);
      }
    }
  });

  test('should edit note content and delete it via editor toolbar', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(300000);

    const noteTitle = `Golden Path Note ${Date.now()}`;
    const noteContent = 'Initial content for golden path test.';
    const updatedTitle = `${noteTitle} (edited)`;
    const updatedContent = 'Updated content - verified by golden path test.';

    await page.goto('/');
    const note = await createNoteFixture(page, { title: noteTitle, content: noteContent });
    trackNote(note.id);

    await prepareWorkspaceUi(page);

    const layout = page.getByTestId('desktop-layout');
    await layout.getByTestId('sidebar-nav-all-notes').click();

    const noteItem = layout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await waitForVisibleWithReload(page, noteItem, 'note in All Notes', async () => {
      await layout.getByTestId('sidebar-nav-all-notes').click();
    });
    await noteItem.click();

    const titleInput = layout.getByTestId('editor-title-input');
    const contentInput = layout.getByTestId('editor-content-input');
    await expect(titleInput).toHaveValue(noteTitle, { timeout: 30000 });
    await expect(contentInput).toContainText(noteContent, { timeout: 30000 });

    console.log('[Golden Path] Editing note title and content');
    await titleInput.fill(updatedTitle);
    // CodeMirror 6 ignores fill()/keyboard.type() — it manages content via transactions.
    // Access CM6's EditorView via the internal .cmTile.view DOM property and dispatch a
    // replace-all transaction so the change propagates through React state → API sync.
    await page.evaluate((content) => {
      const el = document.querySelector('[data-testid="editor-content-input"]');
      const tile = (el as unknown as Record<string, unknown>)?.['cmTile'] as Record<string, unknown> | undefined;
      const view = tile?.['view'] as { dispatch: (t: unknown) => void; state: { doc: { length: number } } } | undefined;
      if (!view) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
    }, updatedContent);
    const updateResponse = waitForWorkspaceChange(page, 'note', 'update', 60000);
    await contentInput.blur();
    await updateResponse;

    await expectVisibleSyncStatus(layout);

    console.log('[Golden Path] Verifying API persistence');
    await waitForNoteContentFixture(page, note.id, updatedContent, 30000);
    const persisted = await getNoteFixture(page, note.id);
    expect(persisted.title).toBe(updatedTitle);

    console.log('[Golden Path] Deleting note via editor toolbar');
    page.once('dialog', (dialog) => dialog.accept());
    const deleteButton = layout.getByTestId('editor-delete-note-button');
    await expect(deleteButton).toBeVisible({ timeout: 10000 });

    const deleteResponse = waitForWorkspaceChange(page, 'note', 'delete', 60000);
    await deleteButton.click();
    await deleteResponse;
    markNoteDeleted(note.id);

    await expect(noteItem).not.toBeVisible({ timeout: 15000 });
  });

  test('should rename and delete a folder via sidebar', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(300000);

    const folderName = `Rename Me ${Date.now()}`;
    const renamedFolderName = `Renamed Folder ${Date.now()}`;

    await page.goto('/');
    const folder = await createFolderFixture(page, folderName);
    trackFolder(folder.id);

    await prepareWorkspaceUi(page);

    const layout = page.getByTestId('desktop-layout');
    const folderItem = layout.getByTestId(`sidebar-folder-item-${folder.id}`);
    await waitForVisibleWithReload(page, folderItem, `folder ${folder.id} in sidebar`);

    console.log('[Golden Path] Renaming folder');
    await folderItem.hover();
    const renameButton = folderItem.getByTestId('sidebar-folder-rename-button');
    await expect(renameButton).toBeVisible({ timeout: 5000 });
    await renameButton.click();

    const editInput = layout.getByTestId('sidebar-folder-edit-input');
    await expect(editInput).toBeVisible({ timeout: 5000 });
    await editInput.fill(renamedFolderName);

    const renameResponse = waitForWorkspaceChange(page, 'folder', 'update', 60000);
    await editInput.press('Enter');
    await renameResponse;

    await expect(folderItem).toContainText(renamedFolderName, { timeout: 15000 });

    console.log('[Golden Path] Deleting folder via sidebar');
    await folderItem.hover();
    const deleteButton = folderItem.getByTestId('sidebar-folder-delete-button');
    await expect(deleteButton).toBeVisible({ timeout: 5000 });

    page.once('dialog', (dialog) => dialog.accept());
    const deleteResponse = waitForWorkspaceChange(page, 'folder', 'delete', 60000);
    await deleteButton.click();
    await deleteResponse;
    markFolderDeleted(folder.id);

    await expect(folderItem).not.toBeVisible({ timeout: 15000 });
  });

  test('should move a note between folders via editor dropdown', async ({ page }) => {
    test.setTimeout(300000);

    const folderAName = `Folder A ${Date.now()}`;
    const folderBName = `Folder B ${Date.now()}`;
    const noteTitle = `Move Me ${Date.now()}`;
    const noteContent = 'Note to be moved between folders.';

    await page.goto('/');
    const folderA = await createFolderFixture(page, folderAName);
    const folderB = await createFolderFixture(page, folderBName);
    const note = await createNoteFixture(page, {
      title: noteTitle,
      content: noteContent,
      folder_id: folderA.id,
    });
    trackFolder(folderA.id);
    trackFolder(folderB.id);
    trackNote(note.id);

    await prepareWorkspaceUi(page);

    const layout = page.getByTestId('desktop-layout');
    const folderAItem = layout.getByTestId(`sidebar-folder-item-${folderA.id}`);
    await waitForVisibleWithReload(page, folderAItem, `folder A ${folderA.id} in sidebar`);
    await folderAItem.click();

    const noteItem = layout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await expect(noteItem).toBeVisible({ timeout: 30000 });
    await noteItem.click();

    await expect(layout.getByTestId('editor-title-input')).toHaveValue(noteTitle, { timeout: 30000 });

    console.log('[Golden Path] Opening editor folder dropdown');
    const folderDropdown = layout.getByTestId('editor-folder-dropdown');
    await expect(folderDropdown).toBeVisible({ timeout: 10000 });
    await folderDropdown.click();

    const updateResponse = waitForWorkspaceChange(page, 'note', 'update', 60000);
    await page.getByRole('button', { name: folderBName, exact: true }).last().click();
    await updateResponse;

    const folderBItem = layout.getByTestId(`sidebar-folder-item-${folderB.id}`);
    await expect(folderBItem).toBeVisible({ timeout: 30000 });
    await folderBItem.click();

    const noteInFolderB = layout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await expect(noteInFolderB).toBeVisible({ timeout: 30000 });

    await folderAItem.click();
    const noteInFolderA = layout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await expect(noteInFolderA).not.toBeVisible({ timeout: 10000 });
  });

  test('should export a note as markdown', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(300000);

    const noteTitle = `Export Test ${Date.now()}`;
    const noteContent = '# Export Me\n\nThis note should be downloadable as Markdown.';

    await page.goto('/');
    const note = await createNoteFixture(page, { title: noteTitle, content: noteContent });
    trackNote(note.id);

    await prepareWorkspaceUi(page);

    const layout = page.getByTestId('desktop-layout');
    await layout.getByTestId('sidebar-nav-all-notes').click();

    const noteItem = layout.locator('[data-testid^="note-list-item-"]').filter({ hasText: noteTitle }).first();
    await waitForVisibleWithReload(page, noteItem, 'export note in All Notes', async () => {
      await layout.getByTestId('sidebar-nav-all-notes').click();
    });
    await noteItem.click();
    await expect(layout.getByTestId('editor-title-input')).toHaveValue(noteTitle, { timeout: 30000 });

    console.log('[Golden Path] Triggering markdown export');
    const exportDropdown = layout.getByTestId('editor-export-dropdown');
    await expect(exportDropdown).toBeVisible({ timeout: 10000 });
    await exportDropdown.click();

    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await layout.getByTestId('editor-export-markdown').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.md$/i);
  });

  test('should create a note in a new folder and delete the folder', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(300000);

    const folderName = `New UI Folder ${Date.now()}`;

    await page.goto('/');
    await prepareWorkspaceUi(page);

    const layout = page.getByTestId('desktop-layout');

    console.log('[Golden Path] Creating folder via UI');
    const addFolderButton = layout.getByTestId('sidebar-add-folder-button');
    await expect(addFolderButton).toBeVisible({ timeout: 30000 });
    await addFolderButton.click();

    const newFolderInput = layout.getByTestId('sidebar-new-folder-input');
    await expect(newFolderInput).toBeVisible({ timeout: 5000 });
    await newFolderInput.fill(folderName);

    const createFolderResponse = waitForWorkspaceChange(page, 'folder', 'create', 60000);
    await layout.getByTestId('sidebar-new-folder-confirm').click();
    const createdFolderId = await createFolderResponse.then((response) =>
      getAppliedEntityId(response, 'folder', 'create')
    );
    trackFolder(createdFolderId);

    const folderItem = layout.getByTestId(`sidebar-folder-item-${createdFolderId}`);
    await expect(folderItem).toBeVisible({ timeout: 30000 });
    await folderItem.click();

    console.log('[Golden Path] Creating note in folder via UI');
    const addNoteButton = layout.getByTestId('note-list-add-note-button');
    await expect(addNoteButton).toBeVisible({ timeout: 15000 });

    const createNoteResponse = waitForWorkspaceChange(page, 'note', 'create', 60000);
    await addNoteButton.click();
    const createdNoteId = await createNoteResponse.then((response) =>
      getAppliedEntityId(response, 'note', 'create')
    );
    trackNote(createdNoteId);

    const titleInput = layout.getByTestId('editor-title-input');
    await expect(titleInput).toBeVisible({ timeout: 30000 });

    const testNoteTitle = `Folder Note ${Date.now()}`;
    await titleInput.fill(testNoteTitle);
    const contentInput = layout.getByTestId('editor-content-input');
    // CodeMirror 6 ignores fill() — dispatch a transaction directly.
    await page.evaluate((content) => {
      const el = document.querySelector('[data-testid="editor-content-input"]');
      const tile = (el as unknown as Record<string, unknown>)?.['cmTile'] as Record<string, unknown> | undefined;
      const view = tile?.['view'] as { dispatch: (t: unknown) => void; state: { doc: { length: number } } } | undefined;
      if (!view) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
    }, 'Content inside the new folder.');

    const updateResponse = waitForWorkspaceChange(page, 'note', 'update', 60000);
    await contentInput.blur();
    await updateResponse;

    await expectVisibleSyncStatus(layout);

    // Use the known note ID (not title text) because the NoteList's filtered
    // view can show a stale title briefly after an optimistic update on the dev server.
    const noteItem = layout.getByTestId(`note-list-item-${createdNoteId}`);
    await expect(noteItem).toBeVisible({ timeout: 30000 });

    console.log('[Golden Path] Deleting folder via NoteList header');
    const deleteFolderButton = layout.getByTestId('note-list-delete-folder-button');
    await expect(deleteFolderButton).toBeVisible({ timeout: 15000 });

    page.once('dialog', (dialog) => dialog.accept());
    const deleteFolderResponse = waitForWorkspaceChange(page, 'folder', 'delete', 60000);
    await deleteFolderButton.click();
    await deleteFolderResponse;
    markFolderDeleted(createdFolderId);
    markNoteDeleted(createdNoteId);

    await expect(folderItem).not.toBeVisible({ timeout: 30000 });
  });
});
