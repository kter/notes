# Storage Management

Manage cookies, localStorage, sessionStorage, and saved browser state.

## Save and restore full state

```bash
playwright-cli state-save
playwright-cli state-save auth.json
playwright-cli state-load auth.json
```

## Cookies

```bash
playwright-cli cookie-list
playwright-cli cookie-get session_id
playwright-cli cookie-set session_id abc123 --domain=example.com --httpOnly --secure
playwright-cli cookie-delete session_id
playwright-cli cookie-clear
```

## localStorage

```bash
playwright-cli localstorage-list
playwright-cli localstorage-get theme
playwright-cli localstorage-set theme dark
playwright-cli localstorage-delete theme
playwright-cli localstorage-clear
```

## sessionStorage

```bash
playwright-cli sessionstorage-list
playwright-cli sessionstorage-get step
playwright-cli sessionstorage-set step 3
playwright-cli sessionstorage-delete step
playwright-cli sessionstorage-clear
```

Use `run-code` when you need bulk or structured storage updates.
