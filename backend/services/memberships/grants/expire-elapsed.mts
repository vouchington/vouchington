import { getMembershipWorkLimits } from '../work-limits.mts'
import createError from 'http-errors'
import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { runBoundedPages } from '@modules/utils/run-bounded-pages'
import { expireElapsedMembershipPage } from './expire-elapsed-page.mts'

export type MembershipExpiryResult = { expired: number; hasMore: boolean }

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
  // One current projection is the schema-bounded work unit, even when the SQL limit is larger.
  const { processed: expired, hasMore: reachedPageLimit } = await runBoundedPages(
    { batchSize: 1, maxBatches },
    () => expireElapsedMembershipPage(userId, query, batchSize, options),
  )
  if (!reachedPageLimit) return { expired, hasMore: false }

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
