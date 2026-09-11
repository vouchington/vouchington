import { write } from '@data-stores/psql'
import { TEST_STATEMENT_TIMEOUT_MS } from './statement-timeout-constant.mts'

export { TEST_STATEMENT_TIMEOUT_MS }

/**
 * Persists TEST_STATEMENT_TIMEOUT_MS as the database-level default so every session opened by test
 * workers gets it. Run from vitest global setup, before test workers fork and connect.
 */
export async function boundStatementTimeoutForTestDatabase(): Promise<void> {
  await write(
    `DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET statement_timeout = ${TEST_STATEMENT_TIMEOUT_MS}', current_database()); END $$;`,
  )
}
