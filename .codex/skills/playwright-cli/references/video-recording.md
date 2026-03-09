# Video Recording

Use video when a visual artifact is more useful than a trace.

## Basic flow

```bash
playwright-cli video-start
playwright-cli open https://example.com
playwright-cli snapshot
playwright-cli click e1
playwright-cli video-stop recordings/demo.webm
```

## Guidance

- use descriptive filenames
- prefer video for demos and quick verification
- prefer tracing for deep debugging
