# Running Custom Playwright Code

Use `run-code` when the CLI command set is not sufficient.

## Syntax

```bash
playwright-cli run-code "async page => {
  // Playwright code
}"
```

## Good use cases

- geolocation and permissions
- custom wait strategies
- iframe interaction
- downloads
- clipboard access
- reading page state
- advanced JavaScript evaluation

## Examples

```bash
playwright-cli run-code "async page => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 35.6762, longitude: 139.6503 });
}"
```

```bash
playwright-cli run-code "async page => {
  await page.waitForSelector('.result', { timeout: 10000 });
}"
```

```bash
playwright-cli run-code "async page => {
  return await page.title();
}"
```

Wrap fragile steps in `try/catch` and return explicit results when debugging.
