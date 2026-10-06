# Backend test helpers

- Load [backend Vitest authoring](../../.agents/skills/backend-vitest-test-authoring/SKILL.md); helper APIs/waits/fixtures belong in [Test helpers](../../docs/development/testing/backend/helpers.md).
- Tests share a dirty parallel database: randomize ownership-scoped fixtures and never clean shared rows.
- Never run DDL (`CREATE`/`DROP`/`ALTER`, `LOCK TABLE`) against a shared table from a test or helper: it times out behind parallel traffic. Inject failures with [`withInjectedFailure`](injected-failures.mts); see [failure injection](../../docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md#failure-injection-uses-control-rows-never-shared-table-ddl).
- Tests do not import raw PostgreSQL helpers or `sql-template-strings`; expose focused setup/assertions here without re-exporting SQL methods.
- Keep helpers under this first-layer root without feature-local directories/forwarders. Entity helpers use `entities/*.mts`; generic helpers stay with narrow package owners.
- Close resources and remove unexpected `console.*` output before handoff.
