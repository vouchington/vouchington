import { getMembershipWorkLimits } from '../work-limits.mts'
import { beginTransaction, write } from '@data-stores/psql'
import { enqueueDeliverMembershipEntitlementEffectsBestEffort } from '@queues/memberships/enqueues'
import sql from 'sql-template-strings'
import { expireElapsedMemberships, type MembershipExpiryResult } from './expire-elapsed.mts'
import {
  repairOrphanedQueuedGrantsBatch,
  type OrphanedQueuedGrantCursor,
} from './repair-orphaned-queued.mts'

type MembershipExpiryBatchResult = MembershipExpiryResult & {
  repairNextCursor: OrphanedQueuedGrantCursor | null
}

export async function resumeExpireElapsedMemberships(
  batchSize = getMembershipWorkLimits().batchSize,
  repairUserIds?: readonly string[],
): Promise<MembershipExpiryBatchResult> {
  const repairCursor = await readOrphanedQueuedGrantRepairCursor()
  const result = await expireElapsedMembershipsBatch(batchSize, repairCursor, repairUserIds)
  // A finished pass stores null so the next scheduled run revisits changed eligibility.
  await saveOrphanedQueuedGrantRepairCursor(result.repairNextCursor)
  return result
}

export async function readOrphanedQueuedGrantRepairCursor(): Promise<OrphanedQueuedGrantCursor | null> {
  const { rows } = await write<{ cursor_id: string | null; cursor_grant_id: string | null }>(
    sql`/* readOrphanedQueuedGrantRepairCursor */
    SELECT cursor_id, cursor_grant_id
    FROM membership_queued_grant_repair_cursors
    WHERE is_singleton`,
  )
  const row = rows[0]
  if (!row?.cursor_id || !row.cursor_grant_id) return null
  return { userId: row.cursor_id, grantId: row.cursor_grant_id }
}

export async function saveOrphanedQueuedGrantRepairCursor(
  cursor: OrphanedQueuedGrantCursor | null,
): Promise<void> {
  await write(sql`/* saveOrphanedQueuedGrantRepairCursor */
    INSERT INTO membership_queued_grant_repair_cursors (is_singleton, cursor_id, cursor_grant_id)
    VALUES (TRUE, ${cursor?.userId ?? null}::uuid, ${cursor?.grantId ?? null}::uuid)
    ON CONFLICT (is_singleton) DO UPDATE
      SET cursor_id = EXCLUDED.cursor_id,
          cursor_grant_id = EXCLUDED.cursor_grant_id`)
}

export async function expireElapsedMembershipsBatch(
  batchSize = getMembershipWorkLimits().batchSize,
  repairCursor: OrphanedQueuedGrantCursor | null = null,
  repairUserIds?: readonly string[],
): Promise<MembershipExpiryBatchResult> {
  const limits = getMembershipWorkLimits()
  const [result, repair] = await Promise.all([
    expireSelectedMembershipUsers(batchSize, limits),
    repairOrphanedQueuedGrantsBatch(repairCursor, batchSize, repairUserIds),
  ])
  const elapsedRemains = await elapsedMembershipWorkRemains()
  return {
    ...result,
    hasMore: result.hasMore || elapsedRemains || repair.hasMore,
    repairNextCursor: repair.hasMore ? repair.nextCursor : null,
  }
}

async function elapsedMembershipWorkRemains(): Promise<boolean> {
  const { rows } = await write(sql`/* expireElapsedMembershipsBatch:hasMore */
    SELECT 1 FROM memberships membership
    JOIN membership_sources source ON source.id = membership.membership_source_id
    WHERE source.source_kind = 'admin_grant'
      AND membership.projection_ended_at IS NULL AND membership.cancelled_at IS NULL
      AND membership.expired_at IS NULL AND membership.expires_at IS NOT NULL
      AND membership.expires_at <= CURRENT_TIMESTAMP
    LIMIT 1`)
  return rows.length > 0
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
  if (expired > 0) await enqueueDeliverMembershipEntitlementEffectsBestEffort()
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
