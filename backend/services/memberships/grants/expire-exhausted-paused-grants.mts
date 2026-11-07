import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recordMembershipExpirations } from '../expiration-changes.mts'

/**
 * Expires the user's paused grants whose remaining duration is exhausted, as of the direct
 * source's suspension time, records one expiration change per grant, then releases the paused
 * grants that remain viable. Returns how many expired.
 */
export async function expireExhaustedPausedGrants(
  userId: string,
  accessSuspendedAt: Date,
  query: QueryExecutor,
): Promise<number> {
  const { rows } = await query<{
    expired_at: Date
    membership_grant_id: string
    membership_id: string
    membership_product_id: string
    membership_source_id: string
  }>(sql`/* resumeGrantAfterDirectTermination: expire exhausted paused grants */
    WITH exhausted AS (
      UPDATE membership_source_states source_state
      SET effective_at = LEAST(source_state.effective_at, ${accessSuspendedAt}),
        cancelled_at = NULL, expired_at = ${accessSuspendedAt},
        past_due_at = NULL, paused_at = NULL, should_auto_renew = false
      FROM membership_grants grant_row
      WHERE grant_row.membership_source_id = source_state.membership_source_id
        AND grant_row.user_id = ${userId} AND grant_row.revoked_at IS NULL
        AND source_state.paused_at IS NOT NULL
        AND fn_membership_grant_remaining_duration(grant_row.id) < INTERVAL '1 millisecond'
        AND NOT EXISTS (
          SELECT 1 FROM membership_grant_activation_periods activation
          WHERE activation.membership_grant_id = grant_row.id AND activation.ended_at IS NULL
        )
      RETURNING grant_row.id AS membership_grant_id, grant_row.membership_product_id,
        source_state.membership_source_id, source_state.expired_at
    )
    SELECT exhausted.*, membership.id AS membership_id
    FROM exhausted
    INNER JOIN LATERAL (
      SELECT id FROM memberships
      WHERE membership_source_id = exhausted.membership_source_id
      ORDER BY projection_ended_at DESC NULLS LAST, id DESC
      LIMIT 1
    ) membership ON true`)
  await recordMembershipExpirations(
    userId,
    rows.map(exhausted => ({
      membershipId: exhausted.membership_id,
      membershipSourceId: exhausted.membership_source_id,
      membershipGrantId: exhausted.membership_grant_id,
      membershipProductId: exhausted.membership_product_id,
      expiredAt: exhausted.expired_at,
    })),
    query,
  )
  await query(sql`/* resumeGrantAfterDirectTermination: release viable paused grant */
    UPDATE membership_source_states source_state
    SET paused_at = NULL
    FROM membership_grants grant_row
    WHERE grant_row.membership_source_id = source_state.membership_source_id
      AND grant_row.user_id = ${userId} AND grant_row.revoked_at IS NULL
      AND source_state.paused_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM membership_grant_activation_periods activation
        WHERE activation.membership_grant_id = grant_row.id AND activation.ended_at IS NULL
      )`)
  return rows.length
}
