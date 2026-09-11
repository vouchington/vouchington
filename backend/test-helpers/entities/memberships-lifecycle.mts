/**
 * Membership lifecycle-state primitives split out of memberships.mts (concern: change-history
 * recording and status→timestamp derivation), used internally by createTestMembership. Not part
 * of the public entities/memberships.mts API — neither of these was exported from the original
 * file, so no re-export is needed for external consumers.
 */

import { setTimeout as delay } from 'node:timers/promises'
import { beginTransaction, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
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
  const locked = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const lockTransaction = holdMembershipUserLock()

  async function holdMembershipUserLock(): Promise<void> {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(sql`/* runTestActionAfterMembershipUserLock:lock */
        SELECT id FROM users WHERE id = ${userId} FOR UPDATE`)
    locked.resolve()
    await release.promise
    await transaction.commit()
  }
  await locked.promise
  const action = startAction()
  let releasedAt: Date
  try {
    await waitForMembershipUserLock(action)
    await delay(100)
    releasedAt = new Date()
  } finally {
    release.resolve()
    await lockTransaction
  }
  return { releasedAt, result: await action }
}

async function waitForMembershipUserLock(action: Promise<unknown>): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { rows } = await write<{ blocked: boolean }>(
      sql`/* waitForMembershipUserLock */ SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity
        WHERE pid <> pg_backend_pid() AND state = 'active' AND wait_event_type = 'Lock'
          AND query LIKE '%/* expireElapsedMemberships: lock user */%'
      ) AS blocked`,
    )
    if (rows[0]?.blocked) return
    const stillWaiting = await Promise.race([action.then(() => false), delay(10).then(() => true)])
    if (!stillWaiting)
      throw new Error('Membership action completed before waiting for the recipient lock')
  }
  throw new Error('Membership action did not wait for the recipient lock')
}
