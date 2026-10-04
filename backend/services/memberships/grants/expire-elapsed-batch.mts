import { getMembershipWorkLimits } from '../work-limits.mts'
import { beginTransaction } from '@data-stores/psql'
import { enqueueDeliverMembershipEntitlementEffectsBestEffort } from '@queues/memberships/enqueues'
import sql from 'sql-template-strings'
import { expireElapsedMemberships, type MembershipExpiryResult } from './expire-elapsed.mts'

export async function expireElapsedMembershipsBatch(
  batchSize = getMembershipWorkLimits().batchSize,
): Promise<MembershipExpiryResult> {
  const limits = getMembershipWorkLimits()
  const result = await expireSelectedMembershipUsers(batchSize, limits)
  const remaining = await getElapsedMembershipUserIdsBatch(1)
  return { ...result, hasMore: result.hasMore || remaining.length > 0 }
}

async function expireSelectedMembershipUsers(
  batchSize: number,
  limits: ReturnType<typeof getMembershipWorkLimits>,
) {
  const userIds = await getElapsedMembershipUserIdsBatch(batchSize)
  return expireElapsedMembershipsForUsers(userIds, limits)
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
  let remainingPages = limits.maxBatches
  for (const userId of userIds) {
    if (remainingPages === 0) {
      hasMore = true
      break
    }
    // eslint-disable-next-line no-await-in-loop
    const result = await expireElapsedMembershipsForUserInTransaction(userId, {
      ...limits,
      maxBatches: remainingPages,
    })
    remainingPages -= Math.max(1, result.pages)
    expired += result.expired
    hasMore ||= result.hasMore
  }
  if (expired > 0) void enqueueDeliverMembershipEntitlementEffectsBestEffort()
  return { expired, hasMore }
}

async function expireElapsedMembershipsForUserInTransaction(
  userId: string,
  limits: ReturnType<typeof getMembershipWorkLimits>,
): Promise<MembershipExpiryResult & { pages: number }> {
  let pages = 0
  await using query = await beginTransaction()
  const { rows } = await query(sql`/* expireElapsedMembershipsBatch: lock user */
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE SKIP LOCKED`)
  const result =
    rows.length === 0
      ? { expired: 0, hasMore: true }
      : await expireElapsedMemberships(userId, query, {
          requireComplete: false,
          limits,
          onPage: () => {
            pages++
          },
        })
  await query.commit()
  return { ...result, pages }
}
