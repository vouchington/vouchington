import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recordMembershipChange } from '../changes.mts'

type ClosedMembership = {
  id: string
  membership_product_id: string
  membership_source_id: string
  expires_at: Date
}

export async function activateOldestQueuedGrant(
  userId: string,
  closedMembership: ClosedMembership,
  query: QueryExecutor,
  startedAt = closedMembership.expires_at,
  membershipSourceId?: string,
): Promise<boolean> {
  const { rows } = await query(sql`/* activateOldestQueuedGrant */
    WITH locked_user AS (
      SELECT id FROM users WHERE id = ${userId} FOR UPDATE
    ), candidate AS (
      SELECT grant_row.id, grant_row.membership_source_id, grant_row.membership_product_id,
        grant_row.created_at, grant_row.granted_by_id, grant_row.note,
        membership_grant_remaining_duration(grant_row.id) AS remaining_duration
      FROM membership_grants grant_row
      INNER JOIN membership_source_states source_state
        ON source_state.membership_source_id = grant_row.membership_source_id
      CROSS JOIN locked_user
      WHERE grant_row.user_id = ${userId} AND grant_row.revoked_at IS NULL
        AND (${membershipSourceId ?? null}::uuid IS NULL
          OR grant_row.membership_source_id = ${membershipSourceId ?? null}::uuid)
        AND source_state.cancelled_at IS NULL AND source_state.expired_at IS NULL
        AND source_state.paused_at IS NULL
        AND membership_grant_remaining_duration(grant_row.id) >= INTERVAL '1 millisecond'
        AND NOT EXISTS (
          SELECT 1 FROM membership_grant_activation_periods activation
          WHERE activation.membership_grant_id = grant_row.id AND activation.ended_at IS NULL
        )
      ORDER BY grant_row.id
      LIMIT 1
    ), activated AS (
      INSERT INTO membership_grant_activation_periods (membership_grant_id, user_id, started_at)
      SELECT id, ${userId}, GREATEST(${startedAt}, created_at)
      FROM candidate
      RETURNING membership_grant_id, started_at
    ), state AS (
      UPDATE membership_source_states source_state
      SET effective_at = activated.started_at,
        expires_at = activated.started_at + candidate.remaining_duration,
        cancelled_at = NULL, expired_at = NULL, past_due_at = NULL, paused_at = NULL,
        auto_renews = false, updated_at = CURRENT_TIMESTAMP
      FROM candidate INNER JOIN activated ON activated.membership_grant_id = candidate.id
      WHERE source_state.membership_source_id = candidate.membership_source_id
      RETURNING candidate.id AS membership_grant_id, candidate.membership_source_id,
        candidate.membership_product_id, candidate.granted_by_id, candidate.note,
        source_state.effective_at, source_state.expires_at
    ) SELECT * FROM state`)
  const grant = rows[0] as
    | {
        effective_at: Date
        expires_at: Date
        membership_grant_id: string
        membership_product_id: string
        membership_source_id: string
        granted_by_id: string | null
        note: string | null
      }
    | undefined
  if (!grant) return false
  // ast-grep-ignore: no-three-sequential-awaits -- projection retirement, replacement, and its durable audit/outbox write are transactionally ordered
  await query(sql`/* activateOldestQueuedGrant: retire closed projection */
    UPDATE memberships SET projection_ended_at = CURRENT_TIMESTAMP
    WHERE id = ${closedMembership.id} AND projection_ended_at IS NULL`)
  const { rows: memberships } = await query(sql`/* activateOldestQueuedGrant: project grant */
    INSERT INTO memberships (
      user_id, membership_source_id, membership_product_id, effective_at, expires_at,
      cancelled_at, expired_at, past_due_at, paused_at, cancel_at_period_end
    ) VALUES (
      ${userId}, ${grant.membership_source_id}, ${grant.membership_product_id},
      ${grant.effective_at}, ${grant.expires_at}, NULL, NULL, NULL, NULL, false
    ) RETURNING id`)
  await recordMembershipChange({
    membershipId: (memberships[0] as { id: string }).id,
    userId,
    membershipSourceId: grant.membership_source_id,
    membershipGrantId: grant.membership_grant_id,
    changeType: 'admin_grant',
    fromSkuId: closedMembership.membership_product_id,
    toSkuId: grant.membership_product_id,
    changedById: grant.granted_by_id,
    note: grant.note,
    query,
  })
  return true
}
