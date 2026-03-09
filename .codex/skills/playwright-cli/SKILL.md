---
name: playwright-cli
description: Automate browser interactions with playwright-cli for web testing, screenshots, form filling, debugging, and data extraction. Use this skill when the user needs to drive a browser from the terminal, inspect page state, generate Playwright test steps, record traces or video, or manipulate browser storage and network behavior.
---

# Playwright CLI

Use this skill when browser work should be done from the terminal with `playwright-cli`.

## Quick workflow

1. Confirm whether `playwright-cli` is available. If the global binary fails, try `npx playwright-cli`.
2. Open a browser session and navigate to the target page.
3. Take a snapshot before interacting so element refs are visible.
4. Use element refs for clicks, fills, checks, and screenshots.
5. Save artifacts only when they are part of the result; otherwise rely on snapshots.
6. Close the session when done.

## Core commands

```bash
playwright-cli open https://example.com
playwright-cli snapshot
playwright-cli click e3
playwright-cli fill e5 "user@example.com"
playwright-cli press Enter
playwright-cli screenshot
playwright-cli close
```

## Practical rules

- Prefer `snapshot` before and after major interactions.
- Use named sessions with `-s=<name>` when isolation matters.
- Use `run-code` only when the CLI command set is not enough.
- Clean up with `close`, `close-all`, or `kill-all` when sessions get stuck.
- Read only the reference file that matches the task:
  - `references/test-generation.md` for turning interactions into Playwright tests
  - `references/storage-state.md` for cookies and storage
  - `references/request-mocking.md` for intercepting requests
  - `references/running-code.md` for advanced Playwright code
  - `references/session-management.md` for multiple sessions
  - `references/tracing.md` for debugging traces
  - `references/video-recording.md` for video capture

## Local installation fallback

If the plain command fails, switch to:

```bash
npx playwright-cli open https://example.com
```
