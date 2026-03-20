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

async function authenticatedJsonRequest<T>(
  page: Page,
  path: string,
  method: string,
  body?: JsonObject
): Promise<T> {
  const { token, apiOrigin } = await page.evaluate(() => {
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

  const response = await page.request.fetch(`${apiOrigin}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    data: body,
  });

  const text = await response.text();
  if (!response.ok()) {
    throw new Error(`${method} ${path} failed: ${response.status()} ${text}`);
  }

  return text ? JSON.parse(text) as T : null as T;
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
