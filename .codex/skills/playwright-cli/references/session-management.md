# Browser Session Management

Use named sessions to isolate cookies, storage, cache, and tabs.

## Basics

```bash
playwright-cli -s=auth open https://app.example.com/login
playwright-cli -s=public open https://example.com
playwright-cli list
playwright-cli -s=auth close
playwright-cli close-all
playwright-cli kill-all
```

## Persistence

```bash
playwright-cli open https://example.com --persistent
playwright-cli open https://example.com --profile=/path/to/profile
playwright-cli -s=oldsession delete-data
```

## Guidance

- choose semantic session names
- use separate sessions for different users or variants
- clean up persistent data when it is no longer needed
