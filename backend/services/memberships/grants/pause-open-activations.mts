import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Stops every active grant at an entitlement handoff boundary without spending its remaining time. */
export async function pauseOpenGrantActivations(
  userId: string,
  pausedAt: Date,
  query: QueryExecutor,
): Promise<void> {
  await query(sql`/* pauseOpenGrantActivations */
    WITH paused AS (
      UPDATE membership_grant_activation_periods activation
      SET ended_at = GREATEST(activation.started_at, ${pausedAt})
      FROM membership_grants grant_row
      WHERE grant_row.id = activation.membership_grant_id
        AND grant_row.user_id = ${userId} AND grant_row.revoked_at IS NULL
        AND activation.ended_at IS NULL
      RETURNING grant_row.membership_source_id, activation.ended_at
    ) UPDATE membership_source_states source_state
    SET paused_at = paused.ended_at, auto_renews = false, updated_at = CURRENT_TIMESTAMP
    FROM paused WHERE source_state.membership_source_id = paused.membership_source_id`)
}
