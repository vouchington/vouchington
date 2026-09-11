import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

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
