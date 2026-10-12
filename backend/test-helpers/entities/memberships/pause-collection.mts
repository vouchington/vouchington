import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Reads the current pause-collection generation, if a work row exists. */
export async function getTestMembershipPauseCollectionRequestedAt(
  userId: string,
): Promise<Date | null> {
  const { rows } = await read<{ requested_at: Date }>(
    sql`/* getTestMembershipPauseCollectionRequestedAt */
      SELECT requested_at FROM membership_pause_collection_work_items
      WHERE user_id = ${userId}
      LIMIT 1
    `,
  )
  return rows[0]?.requested_at ?? null
}

/** Writes one pause-collection generation the same way suspension does, without a service import. */
export async function recordTestMembershipPauseCollectionWork(userId: string): Promise<void> {
  await write(sql`/* recordTestMembershipPauseCollectionWork */
    INSERT INTO membership_pause_collection_work_items (user_id, requested_at)
    VALUES (${userId}, date_trunc('milliseconds', clock_timestamp()))
    ON CONFLICT (user_id) DO UPDATE SET
      requested_at = date_trunc('milliseconds', clock_timestamp()),
      available_at = clock_timestamp(),
      lease_token = NULL,
      leased_at = NULL,
      lease_expires_at = NULL,
      attempt_count = 0
  `)
}

/** Removes one user's pause-collection work so a later dispatcher claim stays scoped. */
export async function deleteTestMembershipPauseCollectionWork(userId: string): Promise<void> {
  await write(sql`/* deleteTestMembershipPauseCollectionWork */
    DELETE FROM membership_pause_collection_work_items WHERE user_id = ${userId}
  `)
}

/** Ages the current pause-collection lease so recovery can replace it. */
export async function expireTestMembershipPauseCollectionLease(userId: string): Promise<void> {
  await write(sql`/* expireTestMembershipPauseCollectionLease */
    UPDATE membership_pause_collection_work_items
    SET leased_at = clock_timestamp() - INTERVAL '6 minutes',
      lease_expires_at = clock_timestamp() - INTERVAL '1 minute'
    WHERE user_id = ${userId} AND lease_token IS NOT NULL
  `)
}
