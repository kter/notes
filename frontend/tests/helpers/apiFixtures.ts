import type { Page } from '@playwright/test';

interface FolderFixture {
  id: string;
  name: string;
}

interface NoteFixture {
  id: string;
  title: string;
  content: string;
  folder_id: string | null;
}

type JsonObject = Record<string, unknown>;

interface AuthenticatedRequestContext {
  token: string;
  apiOrigin: string;
}

interface AuthenticatedRawResponse {
  ok: boolean;
  status: number;
  text: string;
}

async function getAuthenticatedRequestContext(page: Page): Promise<AuthenticatedRequestContext> {
  return page.evaluate(() => {
    const tokenKey = Object.keys(localStorage).find((key) => key.endsWith('.idToken'));
    if (!tokenKey) {
      throw new Error('Missing Cognito idToken in localStorage');
    }

    const idToken = localStorage.getItem(tokenKey);
    if (!idToken) {
      throw new Error('Cognito idToken value was empty');
    }

    return {
      token: idToken,
      apiOrigin: window.location.origin.replace('://notes.', '://api.notes.'),
    };
  });
}

async function authenticatedRawRequest(
  page: Page,
  path: string,
  method: string,
  body?: JsonObject,
  timeoutMs = 30000
): Promise<AuthenticatedRawResponse> {
  const { token, apiOrigin } = await getAuthenticatedRequestContext(page);

  const response = await page.request.fetch(`${apiOrigin}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    data: body,
    timeout: timeoutMs,
  });

  return {
    ok: response.ok(),
    status: response.status(),
    text: await response.text(),
  };
}

async function authenticatedJsonRequest<T>(
  page: Page,
  path: string,
  method: string,
  body?: JsonObject,
  retries = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await authenticatedRawRequest(page, path, method, body);
    if (response.ok) {
      return response.text ? JSON.parse(response.text) as T : null as T;
    }

    lastError = new Error(`${method} ${path} failed: ${response.status} ${response.text}`);

    // Retry on 5xx (Lambda cold start / throttle) but not on 4xx
    if (response.status < 500 || attempt === retries) {
      throw lastError;
    }

    console.log(`[fixture] ${method} ${path} got ${response.status}, retrying (${attempt}/${retries})...`);
    await page.waitForTimeout(3000 * attempt);
  }

  throw lastError!;
}

export async function waitForWorkspaceSnapshotReady(
  page: Page,
  options: {
    attempts?: number;
    delayMs?: number;
    timeoutMs?: number;
  } = {}
): Promise<void> {
  const attempts = options.attempts ?? 10;
  const delayMs = options.delayMs ?? 3000;
  const timeoutMs = options.timeoutMs ?? 30000;
  let lastFailure = 'unknown failure';

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await authenticatedRawRequest(
      page,
      '/api/workspace/snapshot',
      'GET',
      undefined,
      timeoutMs
    );

    if (response.status === 200) {
      return;
    }

    lastFailure = `GET /api/workspace/snapshot failed: ${response.status} ${response.text}`;
    if (response.status < 500) {
      throw new Error(lastFailure);
    }

    console.log(`[fixture] Snapshot warmup got ${response.status}, retrying (${attempt}/${attempts})...`);
    if (attempt < attempts) {
      await page.waitForTimeout(delayMs);
    }
  }

  throw new Error(lastFailure);
}

export async function createFolderFixture(page: Page, name: string): Promise<FolderFixture> {
  return authenticatedJsonRequest<FolderFixture>(page, '/api/folders', 'POST', { name });
}

export async function getNoteFixture(page: Page, noteId: string): Promise<NoteFixture> {
  return authenticatedJsonRequest<NoteFixture>(page, `/api/notes/${noteId}`, 'GET');
}

export async function createNoteFixture(
  page: Page,
  data: { title: string; content: string; folder_id?: string | null }
): Promise<NoteFixture> {
  return authenticatedJsonRequest<NoteFixture>(page, '/api/notes', 'POST', data);
}

export async function deleteNoteFixture(page: Page, noteId: string): Promise<void> {
  await authenticatedJsonRequest<unknown>(page, '/api/workspace/changes', 'POST', {
    changes: [{ entity: 'note', operation: 'delete', entity_id: noteId }],
  });
}

export async function deleteFolderFixture(page: Page, folderId: string): Promise<void> {
  await authenticatedJsonRequest<unknown>(page, '/api/workspace/changes', 'POST', {
    changes: [{ entity: 'folder', operation: 'delete', entity_id: folderId }],
  });
}

export async function updateNoteFixture(
  page: Page,
  noteId: string,
  data: { title?: string; content?: string; folder_id?: string | null }
): Promise<NoteFixture> {
  const result = await authenticatedJsonRequest<{ applied: Array<{ note: NoteFixture }> }>(
    page,
    '/api/workspace/changes',
    'POST',
    {
      changes: [{ entity: 'note', operation: 'update', entity_id: noteId, payload: data }],
    }
  );
  return result.applied[0].note;
}

export async function waitForNoteContentFixture(
  page: Page,
  noteId: string,
  expectedContent: string,
  timeoutMs = 30000
): Promise<NoteFixture> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const note = await getNoteFixture(page, noteId);
    if (note.content === expectedContent) {
      return note;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error(`Timed out waiting for note ${noteId} content to sync`);
}
