# Backend test helpers

- Load [backend Vitest authoring](../../.agents/skills/backend-vitest-test-authoring/SKILL.md); helper APIs/waits/fixtures belong in [Test helpers](../../docs/development/testing/backend/helpers.md).
- Tests share a dirty parallel database: randomize ownership-scoped fixtures and never clean shared rows.
- Tests do not import raw PostgreSQL helpers or `sql-template-strings`; expose focused setup/assertions here without re-exporting SQL methods.
- Keep helpers under this first-layer root without feature-local directories/forwarders. Entity helpers use `entities/*.mts`; generic helpers stay with narrow package owners.
- Close resources and remove unexpected `console.*` output before handoff.
