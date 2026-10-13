import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Records one pause-collection generation inside the caller's suspension transaction. */
export async function recordMembershipPauseCollectionWork(
  query: TransactionQuery,
  userId: string,
): Promise<void> {
  await query(sql`/* recordMembershipPauseCollectionWork */
    INSERT INTO membership_pause_collection_work_items (user_id, requested_at)
    VALUES (${userId}, date_trunc('milliseconds', clock_timestamp()))
    ON CONFLICT (user_id) DO UPDATE SET
      requested_at = date_trunc('milliseconds', clock_timestamp()),
      available_at = clock_timestamp(),
      lease_token = NULL,
      leased_at = NULL,
      lease_expires_at = NULL,
      attempt_count = 0,
      last_failed_at = NULL,
      last_failure_message = NULL
  `)
}
