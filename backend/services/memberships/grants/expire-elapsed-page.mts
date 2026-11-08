import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { recordMembershipChanges, type MembershipChangeInput } from '../changes.mts'
import { restoreFallbackAfterCurrentAccessEndsForLockedUser } from '../fallback/restore-after-current-access-ends.mts'
import { activateOldestQueuedGrantForLockedUser } from './activate-queued.mts'

/** One schema-bounded current projection; the caller holds the user's lock. */
export async function expireElapsedMembershipPage(
  userId: string,
  query: QueryExecutor,
  batchSize: number,
  options: {
    activateQueuedGrants?: boolean
    expiresThrough?: Date
    onPage?: () => void
  },
): Promise<number> {
  // A queued grant can become live after each expiry, so normalize one projection at a time.
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
  // The unique current-projection index permits at most one membership for this user.
  const membership = rows[0] as
    | {
        expires_at: Date
        id: string
        membership_product_id: string
        membership_source_id: string
      }
    | undefined
  if (!membership) return 0
  // Two statements close every elapsed source and its open activations for the whole page.
  const sourceIds = [membership.membership_source_id]
  const expiries = [membership.expires_at]
  await query(sql`/* expireElapsedMemberships: close sources */
    UPDATE membership_source_states state
    SET cancelled_at = NULL, expired_at = closed.expires_at,
      past_due_at = NULL, paused_at = NULL, should_auto_renew = false
    FROM UNNEST(${sourceIds}::uuid[], ${expiries}::timestamptz[]) AS closed(source_id, expires_at)
    WHERE state.membership_source_id = closed.source_id`)
  await query(sql`/* expireElapsedMemberships: close activations */
    UPDATE membership_grant_activation_periods activation
    SET ended_at = closed.expires_at
    FROM UNNEST(${sourceIds}::uuid[], ${expiries}::timestamptz[]) AS closed(source_id, expires_at),
      membership_grants grant_row
    WHERE grant_row.membership_source_id = closed.source_id
      AND activation.membership_grant_id = grant_row.id AND activation.ended_at IS NULL`)
  const changes: MembershipChangeInput[] = [
    {
      membershipId: membership.id,
      userId,
      changeType: 'expiration',
      fromSkuId: membership.membership_product_id,
      expiredAt: membership.expires_at,
    },
  ]
  if (options.activateQueuedGrants !== false) {
    const activated = await activateOldestQueuedGrantForLockedUser(userId, membership, query)
    if (activated) changes.push(activated)
    else {
      // The grant may have been the temporary fallback after a direct source suspended.
      const fallback = await restoreFallbackAfterCurrentAccessEndsForLockedUser(
        userId,
        membership.id,
        query,
      )
      if (fallback) changes.push(fallback)
    }
  }
  // Transitions read source/projection state, so history and entitlement effects can share one page write.
  await recordMembershipChanges(changes, { query })
  return 1
}
