import { write } from './fixture-executor.mts'
import sql from './fixture-sql.mts'

type PostgreSQLTimestamp = Date | string

/**
 * Forces a registered response lease to a specific expiry so tests can assert PostgreSQL-time
 * ownership transitions without racing the test process's wall clock.
 */
export async function setBackgroundResponseLeaseExpiresAt(
  responseId: string,
  leaseExpiresAt: PostgreSQLTimestamp,
): Promise<void> {
  await write(sql`/* setBackgroundResponseLeaseExpiresAt */
    UPDATE openai_background_responses SET lease_expires_at = ${leaseExpiresAt}
    WHERE response_id = ${responseId}
  `)
}
