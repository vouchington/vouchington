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
        paused_at = NULL, cancel_at_period_end = false
      FROM membership_sources source
      WHERE membership.id IN (SELECT id FROM candidates)
        AND source.id = membership.membership_source_id AND source.source_kind = 'admin_grant'
        AND membership.user_id = ${userId} AND membership.projection_ended_at IS NULL
        AND membership.cancelled_at IS NULL AND membership.expired_at IS NULL
        AND membership.expires_at IS NOT NULL
        AND membership.expires_at <= COALESCE(${options.expiresThrough ?? null}::timestamptz, CURRENT_TIMESTAMP)
      RETURNING membership.id, membership.membership_source_id, membership.membership_product_id, membership.expires_at`)
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
          past_due_at = NULL, paused_at = NULL, auto_renews = false, updated_at = CURRENT_TIMESTAMP
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

export async function expireElapsedMembershipsBatch(
  batchSize = getMembershipWorkLimits().batchSize,
): Promise<MembershipExpiryResult> {
  const limits = getMembershipWorkLimits()
  const userIds = await getElapsedMembershipUserIdsBatch(batchSize)
  const result = await expireElapsedMembershipsForUsers(userIds, limits)
  const remaining = await getElapsedMembershipUserIdsBatch(1)
  return { ...result, hasMore: result.hasMore || remaining.length > 0 }
}

export async function getElapsedMembershipUserIdsBatch(batchSize: number): Promise<string[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1)
    throw new RangeError('Membership expiry batch size must be a positive integer')
  await using query = await beginTransaction()
  const { rows } = await query(sql`/* expireElapsedMembershipsBatch: candidates */
      WITH candidates AS MATERIALIZED (
        SELECT membership.user_id FROM memberships membership
        INNER JOIN membership_sources source ON source.id = membership.membership_source_id
        WHERE source.source_kind = 'admin_grant'
          AND membership.projection_ended_at IS NULL AND membership.cancelled_at IS NULL
          AND membership.expired_at IS NULL AND membership.expires_at IS NOT NULL
          AND membership.expires_at <= CURRENT_TIMESTAMP
        ORDER BY membership.expires_at, membership.id LIMIT ${batchSize}
      )
      SELECT user_row.id AS user_id FROM users user_row
      WHERE user_row.id IN (SELECT user_id FROM candidates)
      ORDER BY user_row.id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`)
  const result = (rows as Array<{ user_id: string }>).map(row => row.user_id)
  await query.commit()
  return result
}

export async function expireElapsedMembershipsForUsers(
  userIds: string[],
  limits = getMembershipWorkLimits(),
): Promise<MembershipExpiryResult> {
  let expired = 0
  let hasMore = false
  for (const userId of userIds) {
    // eslint-disable-next-line no-await-in-loop
    const result = await expireElapsedMembershipsForUserInTransaction(userId, limits)
    expired += result.expired
    hasMore ||= result.hasMore
  }
  if (expired > 0) void enqueueDeliverMembershipEntitlementEffectsBestEffort()
  return { expired, hasMore }
}

async function expireElapsedMembershipsForUserInTransaction(
  userId: string,
  limits: ReturnType<typeof getMembershipWorkLimits>,
): Promise<MembershipExpiryResult> {
  await using query = await beginTransaction()
  const { rows } = await query(sql`/* expireElapsedMembershipsBatch: lock user */
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE SKIP LOCKED`)
  const result =
    rows.length === 0
      ? { expired: 0, hasMore: true }
      : await expireElapsedMemberships(userId, query, { requireComplete: false, limits })
  await query.commit()
  return result
}
