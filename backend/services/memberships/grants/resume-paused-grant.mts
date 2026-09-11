import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function resumePausedGrantProjection(
  userId: string,
  directTerminatedAt: Date,
  membershipSourceId: string,
  query: QueryExecutor,
): Promise<boolean> {
  const { rows } = await query(sql`/* resumeGrantAfterDirectTermination: resume active grant */
    WITH candidate AS (
      SELECT grant_row.id AS membership_grant_id, grant_row.membership_source_id,
        grant_row.created_at, membership_grant_remaining_duration(grant_row.id) AS remaining_duration,
        membership.id AS membership_id
      FROM membership_grants grant_row
      INNER JOIN memberships membership
        ON membership.membership_source_id = grant_row.membership_source_id
      INNER JOIN membership_source_states source_state
        ON source_state.membership_source_id = grant_row.membership_source_id
      WHERE grant_row.user_id = ${userId} AND grant_row.revoked_at IS NULL
        AND grant_row.membership_source_id = ${membershipSourceId}
        AND membership.projection_ended_at IS NULL AND membership.cancelled_at IS NULL
        AND membership.expired_at IS NULL AND membership.paused_at IS NULL
        AND source_state.cancelled_at IS NULL AND source_state.expired_at IS NULL
        AND source_state.paused_at IS NULL
        AND membership_grant_remaining_duration(grant_row.id) >= INTERVAL '1 millisecond'
        AND NOT EXISTS (
          SELECT 1 FROM membership_grant_activation_periods activation
          WHERE activation.membership_grant_id = grant_row.id AND activation.ended_at IS NULL
        )
      LIMIT 1
    ), activation AS (
      INSERT INTO membership_grant_activation_periods (membership_grant_id, user_id, started_at)
      SELECT membership_grant_id, ${userId}, GREATEST(${directTerminatedAt}, created_at)
      FROM candidate
      RETURNING membership_grant_id, started_at
    ), state AS (
      UPDATE membership_source_states source_state
      SET effective_at = activation.started_at,
        expires_at = activation.started_at + candidate.remaining_duration,
        updated_at = CURRENT_TIMESTAMP
      FROM candidate
      INNER JOIN activation ON activation.membership_grant_id = candidate.membership_grant_id
      WHERE source_state.membership_source_id = candidate.membership_source_id
      RETURNING candidate.membership_id, source_state.effective_at, source_state.expires_at
    )
    UPDATE memberships membership
    SET effective_at = state.effective_at, expires_at = state.expires_at, updated_at = CURRENT_TIMESTAMP
    FROM state
    WHERE membership.id = state.membership_id
    RETURNING membership.id`)
  return rows.length > 0
}
