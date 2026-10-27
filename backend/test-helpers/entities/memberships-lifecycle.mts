/**
 * Membership lifecycle-state primitives split out of memberships.mts (concern: change-history
 * recording and status→timestamp derivation), used internally by createTestMembership. Not part
 * of the public entities/memberships.mts API — neither of these was exported from the original
 * file, so no re-export is needed for external consumers.
 */

import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { runTestMembershipActionWithLockNotice } from '../membership-user-lock-notice.mts'
import type { MembershipStatus } from '@voucha/types/entities/membership'

// The owning service's change-recording helper is genuine business logic that this package must
// never depend on (this package's own owning service already devDeps this package for its
// tests). This mirrors the service's insert + conditional latest-change-id update with raw SQL.
// Duplication is intentional — see repo test-helpers dependency policy.
export async function recordTestMembershipChange(options: {
  membershipId: string
  userId: string
  toProductId: string
  cancelledAt: Date | null
  expiredAt: Date | null
  pastDueAt: Date | null
  pausedAt: Date | null
  query: QueryExecutor
}): Promise<void> {
  const { rows } = await options.query(sql`/* recordTestMembershipChange */
    INSERT INTO membership_changes (
      membership_id,
      user_id,
      membership_source_id,
      change_type,
      to_membership_product_id
    ) VALUES (
      ${options.membershipId},
      ${options.userId},
      (SELECT membership_source_id FROM memberships WHERE id = ${options.membershipId}),
      'source_observed',
      ${options.toProductId}
    )
    RETURNING id
  `)
  const change = rows[0] as { id: string }

  await options.query(sql`/* recordTestMembershipChange:updateLatest */
    UPDATE memberships m
    SET latest_change_id = ${change.id}
    FROM membership_changes new_change
    WHERE m.id = ${options.membershipId}
      AND new_change.id = ${change.id}
      AND (
        m.latest_change_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM membership_changes current_change
          WHERE current_change.id = m.latest_change_id
            AND (
              current_change.created_at < new_change.created_at
              OR (
                current_change.created_at = new_change.created_at
                AND current_change.id < new_change.id
              )
            )
        )
      )
  `)
}

export function getLifecycleFields(
  status: MembershipStatus,
  effectiveAt: Date,
): {
  cancelledAt: Date | null
  expiredAt: Date | null
  pastDueAt: Date | null
  pausedAt: Date | null
} {
  return {
    cancelledAt: status === 'cancelled' ? effectiveAt : null,
    expiredAt: status === 'expired' ? effectiveAt : null,
    pastDueAt: status === 'past_due' ? effectiveAt : null,
    pausedAt: status === 'paused' ? effectiveAt : null,
  }
}

export async function setTestMembershipGrantRemainingMilliseconds(
  grantId: string,
  remainingMilliseconds: number,
): Promise<void> {
  if (!Number.isFinite(remainingMilliseconds) || remainingMilliseconds < 0)
    throw new RangeError('Remaining grant duration must be a non-negative finite number')
  await using transaction = await beginTransaction()
  const query = transaction
  const { rows } = await query(sql`/* setTestMembershipGrantRemainingMilliseconds */
      INSERT INTO membership_grant_activation_periods (
        membership_grant_id, user_id, started_at, ended_at
      )
      SELECT grant_row.id, grant_row.user_id,
        CURRENT_TIMESTAMP - make_interval(days => grant_row.calendar_days)
          + ${remainingMilliseconds} * INTERVAL '1 millisecond',
        CURRENT_TIMESTAMP
      FROM membership_grants grant_row
      WHERE grant_row.id = ${grantId}
        AND NOT EXISTS (
          SELECT 1 FROM membership_grant_activation_periods activation
          WHERE activation.membership_grant_id = grant_row.id AND activation.ended_at IS NULL
        )
      RETURNING id`)
  await transaction.commit()
  if (rows.length !== 1) throw new Error('Membership grant was not found')
}

export async function runTestActionAfterMembershipUserLock<T>(
  userId: string,
  startAction: () => Promise<T>,
): Promise<{ releasedAt: Date; result: T }> {
  await using holder = await beginTransaction()
  await holder(sql`/* runTestActionAfterMembershipUserLock:lock */
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE`)
  const { rows } = await holder<{ transaction_id: string }>(sql`
    /* runTestActionAfterMembershipUserLock:identity */
    SELECT pg_current_xact_id()::text AS transaction_id
  `)
  const transactionId = rows[0]?.transaction_id
  if (!transactionId) throw new Error('Membership holder has no transaction ID')
  let releasedAt: Date | undefined
  let releasePromise: Promise<void> | undefined
  const releaseHolder = () =>
    (releasePromise ??= (async () => {
      const { rows: timestamps } = await holder<{ released_at: Date }>(sql`
      /* runTestActionAfterMembershipUserLock:release */
      SELECT clock_timestamp() AS released_at
    `)
      releasedAt = timestamps[0]?.released_at
      await holder.commit()
    })())
  const result = await runTestMembershipActionWithLockNotice({
    transactionId,
    userId,
    startAction,
    releaseHolder,
  })
  if (!releasedAt) throw new Error('Membership holder did not report its release lower bound')
  return { releasedAt, result }
}
