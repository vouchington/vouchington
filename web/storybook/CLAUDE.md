# Storybook authoring

Stories run twice: under `web-storybook` (Node, light) and `web-storybook-browser` (Vitest +
Playwright Chromium). Before changing stories, fixtures, mocks, snapshots, coverage, or browser-mode
behavior, read the [storybook-authoring skill](../../.agents/skills/storybook-authoring/SKILL.md) —
it owns those rules. Use [README.md](README.md) and [tests.md](../../docs/development/tests.md) for
commands and the CI runbook.

## See Also

- CI-failure diagnosis runbook and key files reference: [README.md](README.md)
- Web-wide rules: [../CLAUDE.md](../CLAUDE.md)
