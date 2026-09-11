import { describe, expect, it } from 'vitest'
import {
  acquireTestModerationTransparencyDateReservation,
  getTestModerationTransparencyRollupCount,
  getTestReleasedModerationTransparencyRollupCount,
  insertTestModerationTransparencyRollupRow,
  insertTestReleasedModerationTransparencyRollupRow,
  isTestModerationTransparencyLockHeldByAnotherSession,
} from '@voucha/test-helpers'

describe('moderation transparency test date reservations', () => {
  it('serializes and recycles the immutable global rollup window', async () => {
    const first = await acquireTestModerationTransparencyDateReservation()
    try {
      expect(await isTestModerationTransparencyLockHeldByAnotherSession()).toBe(true)
      await insertTestReleasedModerationTransparencyRollupRow({
        occurredAt: first.now,
        metric: 'moderation_actions',
        category: 'approve',
        count: 20,
      })
    } finally {
      await first.release()
    }

    const reused = await acquireTestModerationTransparencyDateReservation()
    try {
      expect(reused.now).toEqual(first.now)
      expect(
        await getTestReleasedModerationTransparencyRollupCount({
          occurredAt: reused.now,
          metric: 'moderation_actions',
          category: 'approve',
        }),
      ).toBeUndefined()
    } finally {
      await reused.release()
    }
  })

  it('scrubs down to the documented 36-month reservation floor', async () => {
    const reservation = await acquireTestModerationTransparencyDateReservation()
    const floor = reservationWindowFloor(reservation.now)
    try {
      await insertTestReleasedModerationTransparencyRollupRow({
        occurredAt: floor,
        metric: 'moderation_actions',
        category: 'approve',
        count: 20,
      })
      await insertTestModerationTransparencyRollupRow({
        occurredAt: floor,
        metric: 'moderation_actions',
        category: 'approve',
        count: 5,
      })
    } finally {
      // release() re-scrubs the reserved window; the floor row must fall inside it.
      await reservation.release()
    }

    const [released, pending] = await Promise.all([
      getTestReleasedModerationTransparencyRollupCount({
        occurredAt: floor,
        metric: 'moderation_actions',
        category: 'approve',
      }),
      getTestModerationTransparencyRollupCount({
        occurredAt: floor,
        metric: 'moderation_actions',
        category: 'approve',
      }),
    ])
    expect(released).toBeUndefined()
    expect(pending).toBeUndefined()
  })
})

// Mirrors the reservation helper's `date_trunc('month', now) - interval '36 months'` floor so this
// test breaks in CI if the helper's scrub window and this regression test ever drift apart.
function reservationWindowFloor(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 36, 1))
}
