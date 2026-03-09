# Request Mocking

Intercept, block, or replace network requests.

## Common commands

```bash
playwright-cli route "**/*.jpg" --status=404
playwright-cli route "**/api/users" --body='[{"id":1,"name":"Alice"}]' --content-type=application/json
playwright-cli route-list
playwright-cli unroute "**/*.jpg"
playwright-cli unroute
```

## Pattern examples

```text
**/api/users
**/api/*/details
**/*.{png,jpg,jpeg}
**/search?q=*
```

## Use `run-code` when you need:

- conditional responses based on request content
- delays
- response rewriting
- network abort simulation

Example:

```bash
playwright-cli run-code "async page => {
  await page.route('**/api/login', route => {
    const body = route.request().postDataJSON();
    if (body.username === 'admin') {
      route.fulfill({ body: JSON.stringify({ token: 'mock-token' }) });
      return;
    }
    route.fulfill({ status: 401, body: JSON.stringify({ error: 'Invalid' }) });
  });
}"
```
