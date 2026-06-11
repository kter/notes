/**
 * エディタへの実キー入力による Markdown 表現の E2E テスト。
 *
 * - raw モードでの Markdown 入力がそのまま永続化されること
 * - live-preview モードでの装飾（見出し・インライン・ブロック要素）が
 *   実際の入力とカーソル移動に追従すること
 * - タスクチェックボックスのクリックがドキュメントを書き換えて保存されること
 * - Enter / Tab / Shift+Tab によるリスト継続・リナンバリング
 * - プレビューペインでの GFM（テーブル・取り消し線）レンダリング
 *
 * AI 機能は一切呼び出さない（課金対象の Bedrock 呼び出しなし）。
 */
import { test, expect, type Page, type Locator } from '@playwright/test';

import {
  createNoteFixture,
  deleteNoteFixture,
  waitForWorkspaceSnapshotReady,
  waitForNoteContentFixture,
} from '../helpers/apiFixtures';

const SNAPSHOT_WARMUP = { attempts: 12, delayMs: 5000, timeoutMs: 30000 };
const DISPLAY_MODE_KEY = 'editor-display-mode';

/** ノートを fixture で作成し、UI 上で開いて contentInput を返す共通セットアップ */
async function openNote(
  page: Page,
  title: string,
  content: string
): Promise<{ noteId: string; layout: Locator; contentInput: Locator }> {
  await page.goto('/');
  const note = await createNoteFixture(page, { title, content });

  await waitForWorkspaceSnapshotReady(page, SNAPSHOT_WARMUP);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');

  const layout = page.getByTestId('desktop-layout');
  await layout.getByTestId('sidebar-nav-all-notes').click();

  const noteItem = layout
    .locator('[data-testid^="note-list-item-"]')
    .filter({ hasText: title })
    .first();
  await expect(noteItem).toBeVisible({ timeout: 30000 });
  await noteItem.click();
  await expect(layout.getByTestId('editor-title-input')).toHaveValue(title, { timeout: 20000 });

  const contentInput = layout.getByTestId('editor-content-input');
  await expect(contentInput).toBeVisible({ timeout: 20000 });
  return { noteId: note.id, layout, contentInput };
}

/** live-preview モードへ切り替える（beforeEach で raw に初期化されている前提） */
async function switchToLivePreview(layout: Locator, page: Page): Promise<void> {
  const toggleButton = layout.getByTestId('editor-display-mode-toggle');
  await toggleButton.click();
  await expect(toggleButton).toHaveAttribute('aria-label', /raw.?text|source|生テキスト/i, { timeout: 5000 });
  await page.waitForTimeout(300);
}

test.describe('Regression: Markdown typing and live rendering', () => {
  test.skip(({ isMobile }) => isMobile, 'Editor keyboard tests are desktop-only');
  // WebKit has known differences in CodeMirror keyboard/composition handling;
  // these typing-driven specs run on Chromium only (same policy as editor-ime.spec.ts).

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((key) => localStorage.removeItem(key), DISPLAY_MODE_KEY);
  });

  test('should persist a typed markdown document exactly (raw mode)', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const noteTitle = `regression-md-roundtrip-${Date.now()}`;
    const { noteId, contentInput } = await openNote(page, noteTitle, '');

    await contentInput.click();
    await page.keyboard.type('# Title');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('**bold** and *italic* and `code`');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    // List continuation inserts "- " automatically; Enter on the empty item exits
    // the list by deleting the marker (lang-markdown insertNewlineContinueMarkup)
    await page.keyboard.type('- one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('---');

    const expectedContent =
      '# Title\n\n**bold** and *italic* and `code`\n\n- one\n- two\n---';

    await expect(contentInput).toContainText('two', { timeout: 5000 });
    await contentInput.blur();
    await waitForNoteContentFixture(page, noteId, expectedContent, 30000);

    await deleteNoteFixture(page, noteId);
  });

  test('should decorate headings and inline styles while typing (live-preview)', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const noteTitle = `regression-md-inline-${Date.now()}`;
    const { noteId, layout, contentInput } = await openNote(page, noteTitle, '');
    await switchToLivePreview(layout, page);

    await contentInput.click();
    await page.keyboard.type('# Hello');

    // Cursor is on the heading line — the marker stays visible and the line is styled
    await expect(contentInput.locator('.cm-md-h1')).toBeVisible({ timeout: 5000 });
    await expect(contentInput).toContainText('# Hello');

    await page.keyboard.press('Enter');
    await page.keyboard.type('**bold** text');

    // Cursor left the heading line — the "# " marker must now be hidden
    await expect(contentInput).not.toContainText('#', { timeout: 5000 });
    await expect(contentInput).toContainText('Hello');

    // Cursor is after "**bold**" content — both ** markers must be hidden
    await expect(contentInput.locator('.cm-md-strong')).toBeVisible({ timeout: 5000 });
    await expect(contentInput).not.toContainText('**');
    await expect(contentInput).toContainText('bold');

    // Click inside the bold text — the cursor enters the range and markers must reappear
    await contentInput.locator('.cm-md-strong').click();
    await expect(contentInput).toContainText('**', { timeout: 5000 });

    await contentInput.blur();
    await waitForNoteContentFixture(page, noteId, '# Hello\n**bold** text', 30000);

    await deleteNoteFixture(page, noteId);
  });

  test('should render block elements of an existing note (live-preview)', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const noteTitle = `regression-md-blocks-${Date.now()}`;
    const content = [
      'intro',
      '',
      '```js',
      'const x = 1;',
      '```',
      '',
      '> quoted line',
      '',
      '- bullet one',
      '',
      '1. numbered',
      '',
      '[site](https://example.com)',
      '',
      '---',
      '',
      'end',
    ].join('\n');
    const { noteId, layout, contentInput } = await openNote(page, noteTitle, content);
    await switchToLivePreview(layout, page);

    // Fenced code block: lines styled, fence markers hidden (cursor is not in the block)
    await expect(contentInput.locator('.cm-md-fenced').first()).toBeVisible({ timeout: 10000 });
    await expect(contentInput).toContainText('const x = 1;');
    await expect(contentInput).not.toContainText('```');

    // Blockquote: line styled, "> " marker hidden
    await expect(contentInput.locator('.cm-md-blockquote')).toBeVisible();
    await expect(contentInput).toContainText('quoted line');
    await expect(contentInput).not.toContainText('>');

    // List markers: bullet and ordered marks styled (not replaced)
    await expect(contentInput.locator('.cm-md-bullet')).toBeVisible();
    await expect(contentInput.locator('.cm-md-ol-mark')).toBeVisible();

    // Link: label styled, URL part hidden
    await expect(contentInput.locator('.cm-md-link')).toBeVisible();
    await expect(contentInput).toContainText('site');
    await expect(contentInput).not.toContainText('https://example.com');

    // Horizontal rule: --- replaced by the styled rule line
    await expect(contentInput.locator('.cm-md-hr-line')).toBeVisible();

    await deleteNoteFixture(page, noteId);
  });

  test('should toggle a task checkbox by click and persist [x] (live-preview)', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const noteTitle = `regression-md-task-${Date.now()}`;
    const { noteId, layout, contentInput } = await openNote(
      page,
      noteTitle,
      '- [ ] buy milk\n- [x] pay bills'
    );
    await switchToLivePreview(layout, page);

    const checkboxes = contentInput.locator('input.cm-md-task-checkbox');
    await expect(checkboxes).toHaveCount(2, { timeout: 10000 });
    await expect(checkboxes.first()).not.toBeChecked();
    await expect(checkboxes.last()).toBeChecked();

    // Focus the editor first so blur-triggered save works after the click
    await contentInput.click();
    await checkboxes.first().click();
    await expect(checkboxes.first()).toBeChecked({ timeout: 5000 });

    await contentInput.blur();
    await waitForNoteContentFixture(page, noteId, '- [x] buy milk\n- [x] pay bills', 30000);

    await deleteNoteFixture(page, noteId);
  });

  test('should continue and renumber ordered lists with Enter/Tab/Shift+Tab', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const noteTitle = `regression-md-ol-${Date.now()}`;
    const { noteId, contentInput } = await openNote(page, noteTitle, '');

    await contentInput.click();
    await page.keyboard.type('1. first');
    await page.keyboard.press('Enter');
    // Continuation must auto-insert "2. "
    await expect(contentInput).toContainText('2.', { timeout: 5000 });
    await page.keyboard.type('second');
    await page.keyboard.press('Enter');
    // Now on the auto-inserted "3. " line; Tab indents and renumbers to "1."
    await page.keyboard.press('Tab');
    await page.keyboard.type('nested');
    await expect(contentInput).toContainText('nested', { timeout: 5000 });

    // Shift+Tab unindents and renumbers back to the parent level ("3.")
    await page.keyboard.press('Shift+Tab');
    await expect(contentInput).toContainText('3. nested', { timeout: 5000 });

    await contentInput.blur();
    await waitForNoteContentFixture(page, noteId, '1. first\n2. second\n3. nested', 30000);

    await deleteNoteFixture(page, noteId);
  });

  test('should continue task lists and blockquotes on Enter while typing', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const noteTitle = `regression-md-continue-${Date.now()}`;
    const { noteId, contentInput } = await openNote(page, noteTitle, '');

    await contentInput.click();
    // Task list: Enter must auto-insert an unchecked "- [ ] " marker
    await page.keyboard.type('- [ ] milk');
    await page.keyboard.press('Enter');
    await page.keyboard.type('eggs');
    await page.keyboard.press('Enter');
    // Enter on the empty task item exits the list
    await page.keyboard.press('Enter');
    // Blockquote: Enter must auto-insert "> "
    await page.keyboard.type('> quote');
    await page.keyboard.press('Enter');
    await page.keyboard.type('more');

    await expect(contentInput).toContainText('more', { timeout: 5000 });
    await contentInput.blur();
    await waitForNoteContentFixture(
      page,
      noteId,
      '- [ ] milk\n- [ ] eggs\n> quote\n> more',
      30000
    );

    await deleteNoteFixture(page, noteId);
  });

  test('should render typed GFM table and strikethrough in the preview pane', async ({ page, browserName }) => {
    if (browserName === 'webkit') test.skip();
    test.setTimeout(120000);

    const noteTitle = `regression-md-gfm-${Date.now()}`;
    const { noteId, layout, contentInput } = await openNote(page, noteTitle, '');

    await contentInput.click();
    await page.keyboard.type('| Name | Qty |');
    await page.keyboard.press('Enter');
    await page.keyboard.type('| --- | --- |');
    await page.keyboard.press('Enter');
    await page.keyboard.type('| pen | 3 |');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('~~old~~ new');

    // Open the side-by-side preview pane and verify GFM rendering
    await layout.getByTestId('editor-preview-toggle').click();
    const previewPane = layout.getByTestId('editor-preview-pane');
    await expect(previewPane).toBeVisible({ timeout: 10000 });

    await expect(previewPane.locator('table')).toBeVisible({ timeout: 10000 });
    await expect(previewPane.locator('th').first()).toHaveText('Name');
    await expect(previewPane.locator('td').first()).toHaveText('pen');
    await expect(previewPane.locator('del')).toHaveText('old');

    await contentInput.blur();
    await waitForNoteContentFixture(
      page,
      noteId,
      '| Name | Qty |\n| --- | --- |\n| pen | 3 |\n\n~~old~~ new',
      30000
    );

    await deleteNoteFixture(page, noteId);
  });
});
