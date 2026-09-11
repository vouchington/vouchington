import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function closeActiveGrant(
  grantId: string,
  membershipSourceId: string,
  revokedAt: Date,
  query: QueryExecutor,
): Promise<void> {
  await query(sql`/* closeActiveGrant: source */
    UPDATE membership_source_states
    SET cancelled_at = ${revokedAt}, expired_at = NULL, past_due_at = NULL, paused_at = NULL,
      auto_renews = false, updated_at = CURRENT_TIMESTAMP
    WHERE membership_source_id = ${membershipSourceId}`)
  await query(sql`/* closeActiveGrant: activation */
    UPDATE membership_grant_activation_periods SET ended_at = GREATEST(started_at, ${revokedAt})
    WHERE membership_grant_id = ${grantId} AND ended_at IS NULL`)
}
