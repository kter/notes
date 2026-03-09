## Skills

A skill is a set of local instructions stored in a `SKILL.md` file. Below is the list of skills available in this repository for Codex to use.

### Available skills

- test-implementation: Implement unit tests and integration tests for backend and API features. Use this skill when the user asks to add tests, improve coverage, write unit or integration tests, close testing gaps, validate backend behavior, or verify deployed services against a real API. (file: /home/ttakahashi/workspace/notes/.codex/skills/test-implementation/SKILL.md)
- playwright-cli: Automate browser interactions with playwright-cli for web testing, screenshots, form filling, debugging, and data extraction. Use this skill when the user needs to drive a browser from the terminal, inspect page state, generate Playwright test steps, record traces or video, or manipulate browser storage and network behavior. (file: /home/ttakahashi/workspace/notes/.codex/skills/playwright-cli/SKILL.md)

### How to use skills

- Discovery: The list above is the skills available in this repository for this session.
- Trigger rules: If the user names a skill or the task clearly matches a skill description, use that skill for the turn.
- Missing or blocked: If a listed skill file cannot be read, state that briefly and continue with the best fallback.
- After choosing a skill, open its `SKILL.md` and read only the parts needed for the task.
- Resolve relative paths from the skill directory first.
- Load files from `references/`, `scripts/`, or `assets/` only when they are needed.
- If multiple skills apply, use the minimal set and state the order.
- Keep context small by loading only the relevant reference files.
