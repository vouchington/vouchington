import type { QueryExecutor } from '@data-stores/psql'
import { DELETED_USER_ID } from '@services/users/constants'
import sql from 'sql-template-strings'

export async function terminateRetainedMembershipGrants(
  query: QueryExecutor,
  userId: string,
): Promise<void> {
  await query(sql`/* cleanupSoftDeletedUserBatch: terminate retained membership grants */
    WITH boundary AS MATERIALIZED (
      SELECT clock_timestamp() AS terminal_at
    ), target_grants AS MATERIALIZED (
      SELECT grant_row.id, grant_row.membership_source_id,
        COALESCE(grant_row.revoked_at, boundary.terminal_at) AS terminal_at
      FROM membership_grants grant_row
      CROSS JOIN boundary
      WHERE grant_row.user_id = ${userId}
      FOR UPDATE OF grant_row
    ), revoked_grants AS (
      UPDATE membership_grants grant_row
      SET revoked_at = target.terminal_at,
        revoked_by_id = ${DELETED_USER_ID},
        revocation_reason = 'account_hard_deleted'
      FROM target_grants target
      WHERE grant_row.id = target.id AND grant_row.revoked_at IS NULL
      RETURNING grant_row.id
    ), closed_activations AS (
      UPDATE membership_grant_activation_periods activation
      SET ended_at = GREATEST(activation.started_at, target.terminal_at)
      FROM target_grants target
      WHERE activation.membership_grant_id = target.id AND activation.ended_at IS NULL
      RETURNING activation.id
    )
    UPDATE membership_source_states source_state
    SET cancelled_at = GREATEST(source_state.effective_at, target.terminal_at),
      expired_at = NULL, past_due_at = NULL, paused_at = NULL,
      auto_renews = false, updated_at = CURRENT_TIMESTAMP
    FROM target_grants target
    WHERE source_state.membership_source_id = target.membership_source_id
      AND source_state.cancelled_at IS NULL AND source_state.expired_at IS NULL
  `)
}
