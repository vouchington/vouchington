# Backend test helpers

- Load [backend Vitest authoring](../../.agents/skills/backend-vitest-test-authoring/SKILL.md); helper APIs/waits/fixtures belong in [Test helpers](../../docs/development/testing/backend/helpers.md).
- Tests share a dirty parallel database: randomize ownership-scoped fixtures and never clean shared rows.
- Never run DDL (`CREATE`/`DROP`/`ALTER`, `LOCK TABLE`) against the shared test database. Inject failures with a throwing [`QueryExecutor`](injected-failures.mts) passed through the real transaction; see [failure injection](../../docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md#failure-injection-uses-a-query-executor).
- Tests do not import raw PostgreSQL helpers or `sql-template-strings`; expose focused setup/assertions here without re-exporting SQL methods.
- Keep helpers under this first-layer root without feature-local directories/forwarders. Entity helpers use `entities/*.mts`; generic helpers stay with narrow package owners.
- Close resources and remove unexpected `console.*` output before handoff.
- Follow the [test suite rules](../../docs/development/tests.md#test-suite-rules).
