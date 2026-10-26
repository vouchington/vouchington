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
  it('holds an exclusive clean window and leaves its immutable rows untouched', async () => {
    const first = await acquireTestModerationTransparencyDateReservation()
    const firstFloor = new Date(Date.UTC(first.now.getUTCFullYear() - 3, 0, 1))
    try {
      expect(await isTestModerationTransparencyLockHeldByAnotherSession(first.now)).toBe(true)
      await insertTestReleasedModerationTransparencyRollupRow({
        occurredAt: first.now,
        metric: 'moderation_actions',
        category: 'approve',
        count: 20,
      })
      await insertTestModerationTransparencyRollupRow({
        occurredAt: firstFloor,
        metric: 'moderation_actions',
        category: 'approve',
        count: 5,
      })
    } finally {
      await first.release()
    }

    const second = await acquireTestModerationTransparencyDateReservation()
    try {
      expect(second.now).not.toEqual(first.now)
      expect(
        await getTestReleasedModerationTransparencyRollupCount({
          occurredAt: second.now,
          metric: 'moderation_actions',
          category: 'approve',
        }),
      ).toBeUndefined()
      expect(
        await getTestModerationTransparencyRollupCount({
          occurredAt: new Date(Date.UTC(second.now.getUTCFullYear() - 3, 0, 1)),
          metric: 'moderation_actions',
          category: 'approve',
        }),
      ).toBeUndefined()
      expect(
        await getTestReleasedModerationTransparencyRollupCount({
          occurredAt: first.now,
          metric: 'moderation_actions',
          category: 'approve',
        }),
      ).toBe(20)
      expect(
        await getTestModerationTransparencyRollupCount({
          occurredAt: firstFloor,
          metric: 'moderation_actions',
          category: 'approve',
        }),
      ).toBe(5)
    } finally {
      await second.release()
    }
  })
})
