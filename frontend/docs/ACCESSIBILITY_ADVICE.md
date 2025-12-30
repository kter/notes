# Accessibility Advice for Robust E2E Testing

To make E2E tests more reliable and easier to maintain (and to improve the user experience for everyone), we should adhere to accessibility best practices. This allows Playwright to use `getByRole()` and `getByLabel()` locators effectively.

## 1. Provide Accessible Names for Icon Buttons

Many buttons in the current codebase use only icons (from Lucide). Screen readers and Playwright's `getByRole` need a text representation.

### Before
```tsx
<Button onClick={onCreateFolder}>
  <FolderPlusIcon className="h-4 w-4" />
</Button>
```

### After (Recommended)
Add an `aria-label` or use a hidden span.

```tsx
<Button onClick={onCreateFolder} aria-label="Create folder">
  <FolderPlusIcon className="h-4 w-4" />
</Button>
```
*Playwright Locator:* `page.getByRole('button', { name: 'Create folder' })`

## 2. Connect Labels to Inputs Properly

Ensure every form input has a corresponding `<label>` with a matching `id`.

### Before
```tsx
<Input placeholder="Folder name" ... />
```

### After (Recommended)
```tsx
<div>
  <label htmlFor="folder-name" className="sr-only">Folder Name</label>
  <Input id="folder-name" placeholder="Folder name" ... />
</div>
```
*Playwright Locator:* `page.getByLabel('Folder Name')`

## 3. Use Semantic Headings

Use `<h1>` through `<h6>` in a logical order to define the structure of the page. This allows Playwright to navigate by region.

*Playwright Locator:* `page.getByRole('heading', { name: 'Folders', level: 2 })`

## 4. Avoid Data-TestID

Only use `data-testid` as a last resort. If you find yourself needing it, ask: "Is there enough information for a blind user to navigate this element?" If not, add ARIA attributes first.

### Safe uses of data-testid:
- Testing complex canvas elements.
- Identifying specific items in a long list where text might duplicate.

## 5. Summary of Recommended Attributes to Add

| Component | Element | Recommendation |
| :--- | :--- | :--- |
| `Sidebar` | Folder add button | Add `aria-label="Add folder"` |
| `Sidebar` | Folder items | Ensure each button has a clear name (the folder name) |
| `NoteList` | Note add button | Add `aria-label="Add note"` |
| `EditorPanel` | Summarize button | Ensure it's reachable via `getByRole('button', { name: 'Summarize' })` |
| `EditorPanel` | Title input | Ensure there's a label or `aria-label="Note title"` |
