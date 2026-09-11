import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { enqueueDeliverMembershipEntitlementEffectsBestEffort } from '@queues/memberships/enqueues'
import sql from 'sql-template-strings'
import { recordMembershipChange } from '../changes.mts'
import { restoreFallbackAfterCurrentAccessEndsInTransaction } from '../fallback/restore-after-current-access-ends.mts'
import { activateOldestQueuedGrant } from './activate-queued.mts'
import { getCurrentMembershipProjection } from './current-projection.mts'
import { expireElapsedMemberships } from './expire-elapsed.mts'
import { resumePausedGrantProjection } from './resume-paused-grant.mts'
import { selectDirectTerminationReplacement } from './select-direct-termination-replacement.mts'
export async function resumeGrantAfterDirectTermination(
  userId: string,
  membershipId: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  const outcome = await resumeGrantAfterDirectAccessSuspensionInTransaction(
    userId,
    membershipId,
    transaction,
  )
  await transaction.commit()
  if (outcome.changed) void enqueueDeliverMembershipEntitlementEffectsBestEffort()
  return outcome.changed
}

export async function resumeGrantAfterDirectAccessSuspensionInTransaction(
  userId: string,
  membershipId: string,
  query: QueryExecutor,
): Promise<{
  activeFamily: boolean
  activeGrant: boolean
  changed: boolean
  retainsPaidAccess: boolean
}> {
  await query(sql`/* resumeGrantAfterDirectTermination: lock user */
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE`)
  const { rows } = await query(sql`/* resumeGrantAfterDirectTermination: source */
    SELECT membership.membership_source_id, membership.membership_product_id,
      COALESCE(source_state.cancelled_at, source_state.expired_at, source_state.paused_at)
        AS access_suspended_at
    FROM memberships membership
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    INNER JOIN membership_source_states source_state
      ON source_state.membership_source_id = source.id
    WHERE membership.id = ${membershipId} AND membership.user_id = ${userId}
      AND source.source_kind = 'direct'
      AND (
        source_state.cancelled_at IS NOT NULL
        OR source_state.expired_at IS NOT NULL
        OR source_state.paused_at IS NOT NULL
      )
    FOR UPDATE`)
  const direct = rows[0] as
    | { membership_product_id: string; membership_source_id: string; access_suspended_at: Date }
    | undefined
  if (!direct)
    return { activeFamily: false, activeGrant: false, changed: false, retainsPaidAccess: false }
  const { rows: exhaustedRows } =
    await query(sql`/* resumeGrantAfterDirectTermination: expire exhausted paused grants */
    WITH exhausted AS (
      UPDATE membership_source_states source_state
      SET effective_at = LEAST(source_state.effective_at, ${direct.access_suspended_at}),
        cancelled_at = NULL, expired_at = ${direct.access_suspended_at},
        past_due_at = NULL, paused_at = NULL, auto_renews = false, updated_at = CURRENT_TIMESTAMP
      FROM membership_grants grant_row
      WHERE grant_row.membership_source_id = source_state.membership_source_id
        AND grant_row.user_id = ${userId} AND grant_row.revoked_at IS NULL
        AND source_state.paused_at IS NOT NULL
        AND membership_grant_remaining_duration(grant_row.id) < INTERVAL '1 millisecond'
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
      ORDER BY projection_ended_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    ) membership ON true`)
  for (const exhausted of exhaustedRows as Array<{
    expired_at: Date
    membership_grant_id: string
    membership_id: string
    membership_product_id: string
    membership_source_id: string
  }>) {
    // eslint-disable-next-line no-await-in-loop
    await recordMembershipChange({
      membershipId: exhausted.membership_id,
      userId,
      membershipSourceId: exhausted.membership_source_id,
      membershipGrantId: exhausted.membership_grant_id,
      changeType: 'expiration',
      fromSkuId: exhausted.membership_product_id,
      expiredAt: exhausted.expired_at,
      query,
    })
  }
  await query(sql`/* resumeGrantAfterDirectTermination: release viable paused grant */
    UPDATE membership_source_states source_state
    SET paused_at = NULL, updated_at = CURRENT_TIMESTAMP
    FROM membership_grants grant_row
    WHERE grant_row.membership_source_id = source_state.membership_source_id
      AND grant_row.user_id = ${userId} AND grant_row.revoked_at IS NULL
      AND source_state.paused_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM membership_grant_activation_periods activation
        WHERE activation.membership_grant_id = grant_row.id AND activation.ended_at IS NULL
      )`)
  const replacement = await selectDirectTerminationReplacement(
    userId,
    direct.membership_source_id,
    query,
  )
  const restoredRetainedSource =
    replacement && replacement.source_kind !== 'admin_grant'
      ? await restoreFallbackAfterCurrentAccessEndsInTransaction(userId, membershipId, query, {
          membershipSourceId: replacement.membership_source_id,
        })
      : false
  if (restoredRetainedSource) {
    const projection = await getCurrentMembershipProjection(userId, query)
    return {
      activeFamily: false,
      activeGrant: false,
      changed: true,
      retainsPaidAccess: projection?.active === true,
    }
  }
  const resumedActiveGrant =
    replacement?.source_kind === 'admin_grant'
      ? await resumePausedGrantProjection(
          userId,
          direct.access_suspended_at,
          replacement.membership_source_id,
          query,
        )
      : false
  const activated = resumedActiveGrant
    ? false
    : replacement?.source_kind === 'admin_grant' &&
      (await activateOldestQueuedGrant(
        userId,
        {
          id: membershipId,
          membership_source_id: direct.membership_source_id,
          membership_product_id: direct.membership_product_id,
          expires_at: direct.access_suspended_at,
        },
        query,
        direct.access_suspended_at,
        replacement.membership_source_id,
      ))
  if (activated) await expireElapsedMemberships(userId, query)
  const currentProjection = await getCurrentMembershipProjection(userId, query)
  const currentIsCoveringFallback =
    currentProjection?.active === true && currentProjection.source_kind !== 'direct'
  const restoredFallback =
    !currentIsCoveringFallback && currentProjection
      ? await restoreFallbackAfterCurrentAccessEndsInTransaction(
          userId,
          currentProjection.id,
          query,
        )
      : false
  const finalProjection = restoredFallback
    ? await getCurrentMembershipProjection(userId, query)
    : currentProjection
  return {
    activeGrant: finalProjection?.active === true && finalProjection.source_kind === 'admin_grant',
    activeFamily: finalProjection?.active === true && finalProjection.source_kind === 'family',
    changed: exhaustedRows.length > 0 || resumedActiveGrant || activated || restoredFallback,
    retainsPaidAccess: finalProjection?.active === true,
  }
}
