import { describe, expect, it } from 'vitest'
import {
  acquireTestModerationTransparencyDateReservation,
  getTestReleasedModerationTransparencyRollupCount,
  insertTestReleasedModerationTransparencyRollupRow,
  isTestModerationTransparencyLockHeldByAnotherSession,
} from '@voucha/test-helpers'

describe('moderation transparency test date reservations', () => {
  it('holds an exclusive clean window and leaves its immutable rows untouched', async () => {
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

    const second = await acquireTestModerationTransparencyDateReservation()
    try {
      expect(second.now).not.toEqual(first.now)
      expect(await isTestModerationTransparencyLockHeldByAnotherSession()).toBe(true)
      expect(
        await getTestReleasedModerationTransparencyRollupCount({
          occurredAt: second.now,
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
    } finally {
      await second.release()
    }
  })
})
