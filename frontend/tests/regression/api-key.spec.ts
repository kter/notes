import { test, expect } from '@playwright/test';

import {
  waitForWorkspaceSnapshotReady,
  authenticatedRawRequest,
  apiKeyRawRequest,
} from '../helpers/apiFixtures';

const SNAPSHOT_WARMUP = { attempts: 12, delayMs: 5000, timeoutMs: 30000 };

async function openSettings(
  page: Parameters<typeof waitForWorkspaceSnapshotReady>[0],
  isMobile: boolean,
) {
  if (isMobile) {
    await page.getByTestId('mobile-nav-folders').click();
    await expect(page.getByTestId('mobile-layout-folders')).toBeVisible();
  }
  const container = isMobile
    ? page.getByTestId('mobile-layout-folders')
    : page.getByTestId('desktop-layout');
  const settingsButton = container.locator('button[title="Settings"]').first();
  await expect(settingsButton).toBeVisible({ timeout: 15000 });
  await settingsButton.click();
}

test.describe('Regression: API Key Lifecycle', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'WebKit requires Docker — missing host gstreamer deps');

  let createdKeyId: string | null = null;
  let createdKeyToken: string | null = null;
  let createdFolderIds: string[] = [];
  let createdNoteIds: string[] = [];

  test.beforeEach(() => {
    createdKeyId = null;
    createdKeyToken = null;
    createdFolderIds = [];
    createdNoteIds = [];
  });

  test.afterEach(async ({ page }) => {
    const failures: string[] = [];

    for (const id of createdNoteIds) {
      try {
        const r = await authenticatedRawRequest(page, `/api/notes/${id}`, 'DELETE');
        if (r.status !== 204 && r.status !== 404) {
          failures.push(`DELETE /api/notes/${id}: ${r.status}`);
        }
      } catch (e) {
        failures.push(`DELETE /api/notes/${id}: ${String(e)}`);
      }
    }

    for (const id of createdFolderIds) {
      try {
        const r = await authenticatedRawRequest(page, `/api/folders/${id}`, 'DELETE');
        if (r.status !== 204 && r.status !== 404) {
          failures.push(`DELETE /api/folders/${id}: ${r.status}`);
        }
      } catch (e) {
        failures.push(`DELETE /api/folders/${id}: ${String(e)}`);
      }
    }

    if (createdKeyId) {
      try {
        const r = await authenticatedRawRequest(
          page,
          `/api/settings/api-keys/${createdKeyId}`,
          'DELETE',
        );
        if (r.status !== 204 && r.status !== 404) {
          failures.push(`DELETE /api/settings/api-keys/${createdKeyId}: ${r.status}`);
        }
      } catch (e) {
        failures.push(`DELETE /api/settings/api-keys/${createdKeyId}: ${String(e)}`);
      }
    }

    if (failures.length > 0) {
      console.warn('[api-key.spec] cleanup issues:', failures);
    }
  });

  test(
    'issue via UI, use against backend CRUD, revoke via UI, verify rejection',
    async ({ page, isMobile, browserName }) => {
      if (browserName === 'webkit') test.skip();
      test.setTimeout(90_000);

      // A. Setup
      await page.goto('/');
      await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
      await openSettings(page, isMobile);
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: /^Settings$|^設定$/i })).toBeVisible({
        timeout: 10000,
      });

      // B. Issue key via UI
      const keyName = `e2e-api-key-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await dialog.locator('#api-key-name').fill(keyName);

      const createRespPromise = page.waitForResponse(
        (r) =>
          r.url().includes('/api/settings/api-keys') &&
          r.request().method() === 'POST' &&
          r.status() === 201,
        { timeout: 30_000 },
      );
      await dialog.getByRole('button', { name: /Create API key|APIキーを作成/i }).click();
      const createResp = await createRespPromise;
      const createBody = (await createResp.json()) as {
        token_plain: string;
        api_key: { id: string };
      };
      createdKeyToken = createBody.token_plain;
      createdKeyId = createBody.api_key.id;

      expect(createdKeyToken).toMatch(/^notes_[A-Za-z0-9_\-=]+$/);
      await expect(dialog.locator('code').filter({ hasText: /^notes_/ })).toContainText(
        createdKeyToken,
      );

      // C. Use key externally — folder + note CRUD
      const folderRes = await apiKeyRawRequest(page, '/api/folders', 'POST', createdKeyToken, {
        name: `e2e-folder-${Date.now()}`,
      });
      expect(folderRes.status()).toBe(201);
      const folder = (await folderRes.json()) as { id: string };
      createdFolderIds.push(folder.id);

      const noteRes = await apiKeyRawRequest(page, '/api/notes', 'POST', createdKeyToken, {
        title: `e2e-note-${Date.now()}`,
        content: 'Created over API key',
        folder_id: folder.id,
      });
      expect(noteRes.status()).toBe(201);
      const note = (await noteRes.json()) as { id: string };
      createdNoteIds.push(note.id);

      const getNoteRes = await apiKeyRawRequest(
        page,
        `/api/notes/${note.id}`,
        'GET',
        createdKeyToken,
      );
      expect(getNoteRes.status()).toBe(200);
      const fetchedNote = (await getNoteRes.json()) as { content: string };
      expect(fetchedNote.content).toBe('Created over API key');

      const patchNoteRes = await apiKeyRawRequest(
        page,
        `/api/notes/${note.id}`,
        'PATCH',
        createdKeyToken,
        { title: 'Updated External Note' },
      );
      expect(patchNoteRes.status()).toBe(200);
      const updatedNote = (await patchNoteRes.json()) as { title: string };
      expect(updatedNote.title).toBe('Updated External Note');

      const deleteNoteRes = await apiKeyRawRequest(
        page,
        `/api/notes/${note.id}`,
        'DELETE',
        createdKeyToken,
      );
      expect(deleteNoteRes.status()).toBe(204);
      createdNoteIds = createdNoteIds.filter((id) => id !== note.id);

      const deleteFolderRes = await apiKeyRawRequest(
        page,
        `/api/folders/${folder.id}`,
        'DELETE',
        createdKeyToken,
      );
      expect(deleteFolderRes.status()).toBe(204);
      createdFolderIds = createdFolderIds.filter((id) => id !== folder.id);

      // D. Revoke via UI — navigate from the unique key name up to its row div
      const keyRow = dialog.locator('p').filter({ hasText: keyName }).locator('xpath=ancestor::div[button][1]');
      page.once('dialog', (d) => d.accept());
      const revokeRespPromise = page.waitForResponse(
        (r) =>
          r.url().includes(`/api/settings/api-keys/${createdKeyId}`) &&
          r.request().method() === 'DELETE',
        { timeout: 30_000 },
      );
      await keyRow.getByRole('button', { name: /Revoke|失効/i }).click();
      const revokeResp = await revokeRespPromise;
      expect(revokeResp.status()).toBe(204);
      createdKeyId = null;

      // E. Verify revoked key is rejected
      const rejectedRes = await apiKeyRawRequest(
        page,
        '/api/folders',
        'GET',
        createdKeyToken,
      );
      expect(rejectedRes.status()).toBe(401);
    },
  );
});
