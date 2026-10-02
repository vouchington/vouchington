# Shared test infrastructure

- Keep this root for shared Vitest project/alias/setup, fake-timer guard, and fork-leak infrastructure consumed by [vitest.config.mts](../vitest.config.mts), not feature helpers.
- Load [Vitest authoring](../.agents/skills/vitest-test-authoring/SKILL.md) for tests, fixtures, or mocks.
- Shared setup files are also compiler inputs under `integration-tests/tsconfig.json`; keep both compiler alias maps consistent with the runtime aliases.
