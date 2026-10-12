import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Ages the current pause-collection lease so recovery can replace it. */
export async function expireTestMembershipPauseCollectionLease(userId: string): Promise<void> {
  await write(sql`/* expireTestMembershipPauseCollectionLease */
    UPDATE membership_pause_collection_work_items
    SET leased_at = clock_timestamp() - INTERVAL '6 minutes',
      lease_expires_at = clock_timestamp() - INTERVAL '1 minute'
    WHERE user_id = ${userId} AND lease_token IS NOT NULL
  `)
}
