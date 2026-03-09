# Tracing

Use traces for debugging page state, network activity, and action timing.

## Basic flow

```bash
playwright-cli tracing-start
playwright-cli open https://example.com
playwright-cli click e1
playwright-cli tracing-stop
```

## Best uses

- failed or flaky interactions
- performance investigation
- capturing evidence for a full user flow

## Guidance

- start tracing before the failing step
- traces can be large, so clean up old files when needed
- prefer traces over video when DOM and network details matter
