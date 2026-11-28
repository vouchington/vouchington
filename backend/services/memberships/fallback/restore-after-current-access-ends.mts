import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recordMembershipChanges, type MembershipChangeInput } from '../changes.mts'
import { activateOldestQueuedGrantForUser } from '../grants/activate-queued.mts'
import { pauseOpenGrantActivations } from '../grants/pause-open-activations.mts'
import {
  moveRenewalPriceIncreaseNotificationState,
  restoreRenewalPriceIncreaseNotificationState,
} from './renewal-notification-state.mts'
import { getHighestPriorityFallbackSource } from './highest-priority-source.mts'
type CurrentMembership = {
  access_ended_at: Date
  id: string
  membership_product_id: string
  membership_source_id: string
}
/**
 * Reprojects the highest-priority valid source after a terminal current projection. This preserves
 * a retained direct term or active administrator grant when a family source is invalidated.
 */
export async function restoreFallbackAfterCurrentAccessEndsInTransaction(
  userId: string,
  membershipId: string,
  query: QueryExecutor,
  options: { membershipSourceId?: string } = {},
): Promise<boolean> {
  await query(sql`/* restoreFallbackAfterCurrentAccessEnds: user */
    SELECT id FROM users WHERE id = ${userId}`)
  const change = await restoreFallbackAfterCurrentAccessEndsForUser(
    userId,
    membershipId,
    query,
    options,
  )
  if (!change) return false
  await recordMembershipChanges([change], { query })
  return true
}
/** Reprojects a fallback and returns its pending history fact. */
export async function restoreFallbackAfterCurrentAccessEndsForUser(
  userId: string,
  membershipId: string,
  query: QueryExecutor,
  options: { membershipSourceId?: string } = {},
): Promise<MembershipChangeInput | null> {
  const current = await getTerminalCurrentMembership(userId, membershipId, query)
  if (!current) return null
  const fallback = await getHighestPriorityFallbackSource(
    userId,
    current.membership_source_id,
    query,
    options.membershipSourceId,
  )
  if (!fallback) return null
  if (
    fallback.source_kind === 'direct' ||
    (fallback.source_kind === 'admin_grant' && !fallback.has_open_grant_activation)
  )
    await pauseOpenGrantActivations(userId, current.access_ended_at, query)
  if (fallback.source_kind === 'admin_grant' && !fallback.has_open_grant_activation)
    return activateOldestQueuedGrantForUser(
      userId,
      {
        id: current.id,
        membership_product_id: current.membership_product_id,
        membership_source_id: current.membership_source_id,
        expires_at: current.access_ended_at,
      },
      query,
      current.access_ended_at,
      fallback.membership_source_id,
    )
  const renewalNotification =
    fallback.source_kind === 'direct'
      ? await moveRenewalPriceIncreaseNotificationState(fallback.membership_source_id, query)
      : undefined
  await query(sql`/* restoreFallbackAfterCurrentAccessEnds: retire current */
    UPDATE memberships SET projection_ended_at = CURRENT_TIMESTAMP
    WHERE id = ${current.id} AND projection_ended_at IS NULL`)
  const { rows } = await query(sql`/* restoreFallbackAfterCurrentAccessEnds: project fallback */
    INSERT INTO memberships (
      user_id, membership_source_id, membership_product_id, effective_at, expires_at,
      cancelled_at, expired_at, past_due_at, paused_at, should_cancel_at_period_end
    ) VALUES (
      ${userId}, ${fallback.membership_source_id}, ${fallback.membership_product_id},
      ${fallback.effective_at}, ${fallback.expires_at}, NULL, NULL,
      ${fallback.source_kind === 'direct' ? fallback.past_due_at : null}, NULL,
      ${fallback.source_kind === 'direct' && !fallback.should_auto_renew}
    ) RETURNING id`)
  const restored = rows[0] as { id: string } | undefined
  if (!restored) return null
  if (renewalNotification)
    await restoreRenewalPriceIncreaseNotificationState(restored.id, renewalNotification, query)
  return {
    membershipId: restored.id,
    userId,
    membershipSourceId: fallback.membership_source_id,
    changeType: 'reactivation',
    fromSkuId: current.membership_product_id,
    toSkuId: fallback.membership_product_id,
    pastDueAt: fallback.source_kind === 'direct' ? fallback.past_due_at : null,
    cancelAtPeriodEnd: fallback.source_kind === 'direct' && !fallback.should_auto_renew,
  }
}
async function getTerminalCurrentMembership(
  userId: string,
  membershipId: string,
  query: QueryExecutor,
): Promise<CurrentMembership | undefined> {
  const { rows } = await query(sql`/* restoreFallbackAfterCurrentAccessEnds: current */
    SELECT membership.id, membership.membership_product_id, membership.membership_source_id,
      COALESCE(
        membership.cancelled_at, membership.expired_at, membership.paused_at,
        source_state.cancelled_at, source_state.expired_at, source_state.paused_at,
        CURRENT_TIMESTAMP
      ) AS access_ended_at
    FROM memberships membership
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    INNER JOIN membership_source_states source_state ON source_state.membership_source_id = source.id
    WHERE membership.id = ${membershipId} AND membership.user_id = ${userId}
      AND membership.projection_ended_at IS NULL
      AND (
        (source.source_kind IN ('direct', 'family') AND (
          source_state.cancelled_at IS NOT NULL OR source_state.expired_at IS NOT NULL
          OR source_state.paused_at IS NOT NULL
        ))
        OR (source.source_kind = 'admin_grant' AND (
          membership.cancelled_at IS NOT NULL OR membership.expired_at IS NOT NULL
        ))
      )
`)
  return rows[0] as CurrentMembership | undefined
}
