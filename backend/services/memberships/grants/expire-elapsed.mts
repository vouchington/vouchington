import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { enqueueDeliverMembershipEntitlementEffectsBestEffort } from '@queues/memberships/enqueues'
import sql from 'sql-template-strings'
import { recordMembershipChange } from '../changes.mts'
import { restoreFallbackAfterCurrentAccessEndsInTransaction } from '../fallback/restore-after-current-access-ends.mts'
import { activateOldestQueuedGrant } from './activate-queued.mts'

const DEFAULT_EXPIRY_BATCH_SIZE = 100

export async function expireElapsedMembershipsForUser(userId: string): Promise<number> {
  await using query = await beginTransaction()
  const expired = await expireElapsedMemberships(userId, query)
  await query.commit()
  if (expired > 0) void enqueueDeliverMembershipEntitlementEffectsBestEffort()
  return expired
}

export async function expireElapsedMemberships(
  userId: string,
  query: QueryExecutor,
  options: { activateQueuedGrants?: boolean; expiresThrough?: Date } = {},
): Promise<number> {
  await query(sql`/* expireElapsedMemberships: lock user */
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE`)
  let expired = 0
  while (true) {
    // A queued grant can become live after each expiry, so normalize one projection at a time.
    // eslint-disable-next-line no-await-in-loop
    const { rows } = await query(sql`/* expireElapsedMemberships */
      UPDATE memberships membership
      SET expired_at = membership.expires_at, cancelled_at = NULL, past_due_at = NULL,
        paused_at = NULL, cancel_at_period_end = false
      FROM membership_sources source
      WHERE source.id = membership.membership_source_id AND source.source_kind = 'admin_grant'
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
    if (elapsed.length === 0) return expired
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
}

export async function expireElapsedMembershipsBatch(
  batchSize = DEFAULT_EXPIRY_BATCH_SIZE,
): Promise<{ expired: number }> {
  const userIds = await getElapsedMembershipUserIdsBatch(batchSize)
  return expireElapsedMembershipsForUsers(userIds)
}

export async function getElapsedMembershipUserIdsBatch(batchSize: number): Promise<string[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1)
    throw new RangeError('Membership expiry batch size must be a positive integer')
  await using query = await beginTransaction()
  const { rows } = await query(sql`/* expireElapsedMembershipsBatch: candidates */
      SELECT user_row.id AS user_id FROM users user_row
      WHERE EXISTS (
        SELECT 1 FROM memberships membership
        INNER JOIN membership_sources source ON source.id = membership.membership_source_id
        WHERE membership.user_id = user_row.id AND source.source_kind = 'admin_grant'
          AND membership.projection_ended_at IS NULL AND membership.cancelled_at IS NULL
          AND membership.expired_at IS NULL AND membership.expires_at IS NOT NULL
          AND membership.expires_at <= CURRENT_TIMESTAMP
      )
    ORDER BY user_row.id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`)
  const result = (rows as Array<{ user_id: string }>).map(row => row.user_id)
  await query.commit()
  return result
}

export async function expireElapsedMembershipsForUsers(
  userIds: string[],
): Promise<{ expired: number }> {
  let expired = 0
  for (const userId of userIds) {
    // eslint-disable-next-line no-await-in-loop
    expired += await expireElapsedMembershipsForUserInTransaction(userId)
  }
  if (expired > 0) void enqueueDeliverMembershipEntitlementEffectsBestEffort()
  return { expired }
}

async function expireElapsedMembershipsForUserInTransaction(userId: string): Promise<number> {
  await using query = await beginTransaction()
  const { rows } = await query(sql`/* expireElapsedMembershipsBatch: lock user */
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE SKIP LOCKED`)
  const expired = rows.length === 0 ? 0 : await expireElapsedMemberships(userId, query)
  await query.commit()
  return expired
}
