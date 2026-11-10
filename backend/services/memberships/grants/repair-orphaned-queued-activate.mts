import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipChangeInput } from '../changes.mts'

type ActivatedOrphanedGrantRow = {
  from_product_id: string
  granted_by_id: string | null
  membership_grant_id: string
  membership_id: string
  membership_product_id: string
  membership_source_id: string
  note: string | null
}

/** Ends one cancelled or expired current projection and inserts its still-queued grant. */
export async function activateOrphanedQueuedGrant(
  userId: string,
  query: QueryExecutor,
): Promise<MembershipChangeInput | null> {
  const { rows } = await query<ActivatedOrphanedGrantRow>(sql`/* repairOrphanedQueuedGrant */
    WITH candidate AS MATERIALIZED (
      SELECT grant_row.id, grant_row.membership_source_id, grant_row.membership_product_id,
        grant_row.created_at, grant_row.granted_by_id, grant_row.note,
        fn_membership_grant_remaining_duration(grant_row.id) AS remaining_duration
      FROM membership_grants grant_row
      INNER JOIN membership_source_states source_state
        ON source_state.membership_source_id = grant_row.membership_source_id
      WHERE grant_row.user_id = ${userId} AND grant_row.revoked_at IS NULL
        AND source_state.cancelled_at IS NULL AND source_state.expired_at IS NULL
        AND source_state.paused_at IS NULL
        AND fn_membership_grant_remaining_duration(grant_row.id) >= INTERVAL '1 millisecond'
        AND NOT EXISTS (
          SELECT 1 FROM membership_grant_activation_periods activation
          WHERE activation.membership_grant_id = grant_row.id
            AND activation.user_id = ${userId} AND activation.ended_at IS NULL
        )
      ORDER BY grant_row.id
      LIMIT 1
    ), current_projection AS MATERIALIZED (
      SELECT id FROM memberships
      WHERE user_id = ${userId} AND projection_ended_at IS NULL
        AND (cancelled_at IS NOT NULL OR expired_at IS NOT NULL)
    ), ended AS (
      UPDATE memberships SET projection_ended_at = CURRENT_TIMESTAMP
      WHERE id = (SELECT id FROM current_projection)
        AND user_id = ${userId} AND projection_ended_at IS NULL
        AND (cancelled_at IS NOT NULL OR expired_at IS NOT NULL)
        AND EXISTS (SELECT 1 FROM candidate)
      RETURNING id, membership_product_id, cancelled_at, expired_at
    ), activated AS (
      INSERT INTO membership_grant_activation_periods (membership_grant_id, user_id, started_at)
      SELECT candidate.id, ${userId}::uuid,
        GREATEST(COALESCE(ended.cancelled_at, ended.expired_at), candidate.created_at)
      FROM candidate
      INNER JOIN ended ON true
      RETURNING membership_grant_id, started_at
    ), state AS (
      UPDATE membership_source_states source_state SET
        effective_at = activated.started_at,
        expires_at = activated.started_at + candidate.remaining_duration,
        cancelled_at = NULL, expired_at = NULL, past_due_at = NULL, paused_at = NULL,
        should_auto_renew = false
      FROM activated
      INNER JOIN candidate ON candidate.id = activated.membership_grant_id
      WHERE source_state.membership_source_id = candidate.membership_source_id
        AND source_state.cancelled_at IS NULL AND source_state.expired_at IS NULL
        AND source_state.paused_at IS NULL
      RETURNING source_state.membership_source_id
    ), inserted AS (
      INSERT INTO memberships (
        user_id, membership_source_id, membership_product_id, effective_at, expires_at,
        cancelled_at, expired_at, past_due_at, paused_at, should_cancel_at_period_end
      )
      SELECT ${userId}::uuid, candidate.membership_source_id, candidate.membership_product_id,
        activated.started_at, activated.started_at + candidate.remaining_duration,
        NULL, NULL, NULL, NULL, false
      FROM state
      INNER JOIN candidate ON candidate.membership_source_id = state.membership_source_id
      INNER JOIN activated ON activated.membership_grant_id = candidate.id
      RETURNING id, membership_product_id
    )
    SELECT inserted.id AS membership_id, candidate.id AS membership_grant_id,
      candidate.membership_source_id, inserted.membership_product_id, candidate.granted_by_id,
      candidate.note, ended.membership_product_id AS from_product_id
    FROM inserted
    INNER JOIN candidate ON true
    INNER JOIN ended ON true`)
  const grant = rows[0]
  if (!grant) return null
  return {
    membershipId: grant.membership_id,
    userId,
    membershipSourceId: grant.membership_source_id,
    membershipGrantId: grant.membership_grant_id,
    changeType: 'admin_grant',
    fromSkuId: grant.from_product_id,
    toSkuId: grant.membership_product_id,
    changedById: grant.granted_by_id,
    note: grant.note,
  }
}
