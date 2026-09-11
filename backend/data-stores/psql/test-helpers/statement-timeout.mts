import { read, write } from '@data-stores/psql'

// @data-stores/psql cannot depend on @voucha/test-helpers (see vector-search-recall.mts in this
// directory for why). Straight duplicate of test-helpers' statement-timeout.mts constant, used by
// __tests__/statement-timeout.test.mts. boundStatementTimeoutForTestDatabase() is intentionally
// not duplicated here — it's only called from the repo-root vitest globalSetup, never from a psql
// test file directly.

export const TEST_STATEMENT_TIMEOUT_MS =
  Number.parseInt(process.env.PG_TEST_STATEMENT_TIMEOUT_MS ?? '', 10) || 20_000

type PoolQuery = typeof read | typeof write

/**
 * `read` and `write` are separate `createPsql()` pools; the ALTER DATABASE default is
 * database-level, but this checks both explicitly rather than assuming they behave identically.
 */
export async function getSessionStatementTimeout(query: PoolQuery = read): Promise<number> {
  // pg_settings.setting reports the raw base-unit (ms) integer as text. current_setting() /
  // SHOW apply "friendliest unit" formatting instead (verified empirically: 20000ms round-trips
  // as "20s", 750ms as "750ms", 20003ms as "20003ms") — parseInt on that output silently
  // truncates round values ("20s" -> 20, not 20000), so it cannot be used here.
  const { rows } = await query(`SELECT setting FROM pg_settings WHERE name = 'statement_timeout'`)
  return Number.parseInt(rows[0].setting, 10)
}
