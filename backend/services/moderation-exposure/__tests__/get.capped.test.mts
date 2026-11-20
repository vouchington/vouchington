import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedTestModerationMediaRevealsOldestFirst } from '@voucha/test-helpers/entities/moderation-exposure'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import type { PrivateUser } from '@services/users/types'
import { getExposureState } from '../get.mts'
import {
  EXPOSURE_BREAK_THRESHOLD,
  EXPOSURE_COOLDOWN_MINUTES,
  EXPOSURE_COUNT_DISPLAY_CAP_MAX,
  getExposureCountDisplayCap,
  moderationExposureConfig,
} from '../config.mts'

const DISPLAY_CAP = getExposureCountDisplayCap()

function seedReveals(moderator: PrivateUser, total: number): Promise<Date> {
  return seedTestModerationMediaRevealsOldestFirst(moderator.id, total, EXPOSURE_BREAK_THRESHOLD)
}

function expectedCooldownEnd(thresholdAt: Date): string {
  return new Date(thresholdAt.getTime() + EXPOSURE_COOLDOWN_MINUTES * 60_000).toISOString()
}

describe('getExposureState - capped count', () => {
  it('keeps the cap at or above the threshold so cooldown timing stays exact', () => {
    expect(DISPLAY_CAP).toBeGreaterThanOrEqual(EXPOSURE_BREAK_THRESHOLD)
  })

  describe('exactly at the cap', () => {
    let moderator: PrivateUser
    let thresholdAt: Date

    beforeAll(async () => {
      moderator = await createTestUser()
      thresholdAt = await seedReveals(moderator, DISPLAY_CAP)
    })

    it('reports the exact count without the capped flag', async () => {
      const state = await getExposureState(moderator.id)
      expect(state.count).toBe(DISPLAY_CAP)
      expect(state.count_capped).toBe(false)
    })

    it('ends the cooldown a fixed interval after the threshold-th oldest reveal', async () => {
      const state = await getExposureState(moderator.id)
      expect(state.in_cooldown).toBe(true)
      expect(state.cooldown_ends_at).toBe(expectedCooldownEnd(thresholdAt))
    })
  })

  describe('exactly cap + 1 distinct reveals', () => {
    let moderator: PrivateUser

    beforeAll(async () => {
      moderator = await createTestUser()
      await seedReveals(moderator, DISPLAY_CAP + 1)
    })

    it('flags the capped count at the first reveal past the cap', async () => {
      const state = await getExposureState(moderator.id)
      expect(state.count).toBe(DISPLAY_CAP)
      expect(state.count_capped).toBe(true)
    })
  })

  describe('well beyond the cap', () => {
    let moderator: PrivateUser
    let thresholdAt: Date

    beforeAll(async () => {
      moderator = await createTestUser()
      thresholdAt = await seedReveals(moderator, EXPOSURE_COUNT_DISPLAY_CAP_MAX + 2)
    })

    it('clamps count to the cap and sets count_capped', async () => {
      const state = await getExposureState(moderator.id)
      expect(state.count).toBe(DISPLAY_CAP)
      expect(state.count_capped).toBe(true)
    })

    it('keeps the threshold row exact when rows beyond the read limit exist', async () => {
      const state = await getExposureState(moderator.id)
      expect(state.threshold).toBe(EXPOSURE_BREAK_THRESHOLD)
      expect(state.in_cooldown).toBe(true)
      expect(state.cooldown_ends_at).toBe(expectedCooldownEnd(thresholdAt))
    })
  })

  describe('configured cap below the default', () => {
    const SMALL_CAP = 12
    let moderator: PrivateUser
    let thresholdAt: Date
    let restore: () => void

    beforeAll(async () => {
      moderator = await createTestUser()
      thresholdAt = await seedReveals(moderator, SMALL_CAP + 1)
      restore = overrideDynamicConfigFieldsForTest(moderationExposureConfig, {
        count_display_cap: SMALL_CAP,
      })
    })

    afterAll(() => restore())

    it('clamps to the configured cap and keeps the cooldown exact', async () => {
      const state = await getExposureState(moderator.id)
      expect(state.count).toBe(SMALL_CAP)
      expect(state.count_capped).toBe(true)
      expect(state.in_cooldown).toBe(true)
      expect(state.cooldown_ends_at).toBe(expectedCooldownEnd(thresholdAt))
    })
  })
})
