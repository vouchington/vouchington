/**
 * `@vouchington/postgres`'s test pool configuration sets `statement_timeout: 0` (unbounded) so
 * legitimately slow fixtures never trip a per-connection bound. `0` is falsy, so pg's startup
 * packet omits `statement_timeout` entirely (`pg/lib/client.js`) and every test connection falls
 * through to the *database-level* default instead — which lets this database-level `ALTER` bind it
 * without a `@vouchington/postgres` change. `20_000` is strictly below `testTimeout: 30_000`
 * (`test-helpers/vitest-config/backend-data-projects.mts`), leaving headroom for a `57014` to
 * propagate through the route and supertest before vitest's own timeout would otherwise fire — so
 * a stuck statement fails as an attributable error (see `query-telemetry.mts` for the attribution
 * half) instead of an opaque vitest timeout. Migrations, `beginBoundedTransaction`, and existing
 * lock helpers all set their own session/transaction-local `statement_timeout` and are unaffected
 * by this database-level default.
 *
 * Deliberately import-free: `ci/vitest-backend-config.test.mts` reads this value from the root
 * TypeScript program, which cannot resolve `@data-stores/psql` — the import `statement-timeout.mts`
 * (this file's re-exporter) needs for `boundStatementTimeoutForTestDatabase`. Keep this file free
 * of imports so that edge keeps resolving.
 */
export const TEST_STATEMENT_TIMEOUT_MS =
  Number.parseInt(process.env.PG_TEST_STATEMENT_TIMEOUT_MS ?? '', 10) || 20_000
