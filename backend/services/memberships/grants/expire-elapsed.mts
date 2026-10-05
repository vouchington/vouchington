import { getMembershipWorkLimits } from '../work-limits.mts'
import createError from 'http-errors'
import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { enqueueDeliverMembershipEntitlementEffectsBestEffort } from '@queues/memberships/enqueues'
import sql from 'sql-template-strings'
import { recordMembershipChange } from '../changes.mts'
import { restoreFallbackAfterCurrentAccessEndsInTransaction } from '../fallback/restore-after-current-access-ends.mts'
import { activateOldestQueuedGrant } from './activate-queued.mts'

export type MembershipExpiryResult = { expired: number; hasMore: boolean }

export async function expireElapsedMembershipsForUser(userId: string): Promise<number> {
  await using query = await beginTransaction()
  const { expired } = await expireElapsedMemberships(userId, query)
  await query.commit()
  if (expired > 0) void enqueueDeliverMembershipEntitlementEffectsBestEffort()
  return expired
}

export async function expireElapsedMemberships(
  userId: string,
  query: QueryExecutor,
  options: {
    activateQueuedGrants?: boolean
    expiresThrough?: Date
    requireComplete?: boolean
    limits?: ReturnType<typeof getMembershipWorkLimits>
    onPage?: () => void
  } = {},
): Promise<MembershipExpiryResult> {
  await query(sql`/* expireElapsedMemberships: lock user */
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE`)
  const { batchSize, maxBatches } = options.limits ?? getMembershipWorkLimits()
  let expired = 0
  for (let batch = 0; batch < maxBatches; batch++) {
    // A queued grant can become live after each expiry, so normalize one projection at a time.
    // eslint-disable-next-line no-await-in-loop
    const { rows } = await query(sql`/* expireElapsedMemberships */
      WITH candidates AS (
        SELECT membership.id FROM memberships membership
        JOIN membership_sources source ON source.id = membership.membership_source_id
        WHERE source.source_kind = 'admin_grant' AND membership.user_id = ${userId}
          AND membership.projection_ended_at IS NULL AND membership.cancelled_at IS NULL
          AND membership.expired_at IS NULL AND membership.expires_at IS NOT NULL
          AND membership.expires_at <= COALESCE(${options.expiresThrough ?? null}::timestamptz, CURRENT_TIMESTAMP)
        ORDER BY membership.expires_at, membership.id LIMIT ${batchSize} FOR UPDATE OF membership
      )
      UPDATE memberships membership
      SET expired_at = membership.expires_at, cancelled_at = NULL, past_due_at = NULL,
        paused_at = NULL, should_cancel_at_period_end = false
      FROM membership_sources source
      WHERE membership.id IN (SELECT id FROM candidates)
        AND source.id = membership.membership_source_id AND source.source_kind = 'admin_grant'
        AND membership.user_id = ${userId} AND membership.projection_ended_at IS NULL
        AND membership.cancelled_at IS NULL AND membership.expired_at IS NULL
        AND membership.expires_at IS NOT NULL
        AND membership.expires_at <= COALESCE(${options.expiresThrough ?? null}::timestamptz, CURRENT_TIMESTAMP)
      RETURNING membership.id, membership.membership_source_id, membership.membership_product_id, membership.expires_at`)
    options.onPage?.()
    const elapsed = rows as Array<{
      expires_at: Date
      id: string
      membership_product_id: string
      membership_source_id: string
    }>
    if (elapsed.length === 0) return { expired, hasMore: false }
    expired += elapsed.length
    for (const membership of elapsed) {
      // eslint-disable-next-line no-await-in-loop
      await query(sql`/* expireElapsedMemberships: close source */
        UPDATE membership_source_states
        SET cancelled_at = NULL, expired_at = ${membership.expires_at},
          past_due_at = NULL, paused_at = NULL, should_auto_renew = false
        WHERE membership_source_id = ${membership.membership_source_id}`)
      // eslint-disable-next-line no-await-in-loop
      await query(sql`/* expireElapsedMemberships: close activation */
        UPDATE membership_grant_activation_periods activation
        SET ended_at = ${membership.expires_at}
        FROM membership_grants grant_row
        WHERE grant_row.membership_source_id = ${membership.membership_source_id}
          AND activation.membership_grant_id = grant_row.id AND activation.ended_at IS NULL`)
      // eslint-disable-next-line no-await-in-loop
      await recordMembershipChange({
        membershipId: membership.id,
        userId,
        changeType: 'expiration',
        fromSkuId: membership.membership_product_id,
        expiredAt: membership.expires_at,
        query,
      })
      if (options.activateQueuedGrants !== false) {
        // eslint-disable-next-line no-await-in-loop
        const activated = await activateOldestQueuedGrant(userId, membership, query)
        if (!activated) {
          // The grant may have been the temporary fallback after a direct source suspended.
          // eslint-disable-next-line no-await-in-loop
          await restoreFallbackAfterCurrentAccessEndsInTransaction(userId, membership.id, query)
        }
      }
    }
  }
  const { rows } = await query(sql`/* expireElapsedMemberships:hasMore */
    SELECT 1 FROM memberships membership
    JOIN membership_sources source ON source.id = membership.membership_source_id
    WHERE membership.user_id = ${userId} AND source.source_kind = 'admin_grant'
      AND membership.projection_ended_at IS NULL AND membership.cancelled_at IS NULL
      AND membership.expired_at IS NULL AND membership.expires_at IS NOT NULL
      AND membership.expires_at <= COALESCE(${options.expiresThrough ?? null}::timestamptz, CURRENT_TIMESTAMP)
    LIMIT 1`)
  const hasMore = rows.length > 0
  if (hasMore && options.requireComplete !== false)
    throw createError(
      409,
      'Membership expiry is still in progress; retry after background reconciliation',
    )
  return { expired, hasMore }
}
