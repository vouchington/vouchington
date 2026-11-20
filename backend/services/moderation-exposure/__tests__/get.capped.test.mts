import { beforeAll, describe, expect, it } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getExposureState } from '../get.mts'
import {
  EXPOSURE_BREAK_THRESHOLD,
  EXPOSURE_COOLDOWN_MINUTES,
  EXPOSURE_COUNT_DISPLAY_CAP,
} from '../config.mts'

/** Inserts `total` distinct anonymous reveals; the oldest threshold-many are 5 minutes old. */
async function seedReveals(moderator: PrivateUser, total: number): Promise<Date> {
  const { rows } = await write<{ thresholdAt: Date }>(sql`/* seedExposureReveals */
    WITH inserted AS (
      INSERT INTO moderation_media_reveals (moderator_user_id, surface, revealed_at)
      SELECT
        ${moderator.id},
        'mod_queue',
        CASE
          WHEN n <= ${EXPOSURE_BREAK_THRESHOLD}
            THEN now() - interval '5 minutes' + n * interval '1 millisecond'
          ELSE now() - interval '1 minute' + n * interval '1 millisecond'
        END
      FROM generate_series(1, ${total}) AS n
      RETURNING revealed_at
    )
    SELECT revealed_at AS "thresholdAt"
    FROM inserted
    ORDER BY revealed_at
    OFFSET ${EXPOSURE_BREAK_THRESHOLD - 1} LIMIT 1
  `)
  return rows[0]!.thresholdAt
}

function expectedCooldownEnd(thresholdAt: Date): string {
  return new Date(thresholdAt.getTime() + EXPOSURE_COOLDOWN_MINUTES * 60_000).toISOString()
}

describe('getExposureState - capped count', () => {
  it('keeps the cap at or above the threshold so cooldown timing stays exact', () => {
    expect(EXPOSURE_COUNT_DISPLAY_CAP).toBeGreaterThanOrEqual(EXPOSURE_BREAK_THRESHOLD)
  })

  describe('exactly at the cap', () => {
    let moderator: PrivateUser
    let thresholdAt: Date

    beforeAll(async () => {
      moderator = await createTestUser()
      thresholdAt = await seedReveals(moderator, EXPOSURE_COUNT_DISPLAY_CAP)
    })

    it('reports the exact count without the capped flag', async () => {
      const state = await getExposureState(moderator.id)
      expect(state.count).toBe(EXPOSURE_COUNT_DISPLAY_CAP)
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
      await seedReveals(moderator, EXPOSURE_COUNT_DISPLAY_CAP + 1)
    })

    it('flags the capped count at the first reveal past the cap', async () => {
      const state = await getExposureState(moderator.id)
      expect(state.count).toBe(EXPOSURE_COUNT_DISPLAY_CAP)
      expect(state.count_capped).toBe(true)
    })
  })

  describe('well beyond the cap', () => {
    let moderator: PrivateUser
    let thresholdAt: Date

    beforeAll(async () => {
      moderator = await createTestUser()
      thresholdAt = await seedReveals(moderator, EXPOSURE_COUNT_DISPLAY_CAP + 25)
    })

    it('clamps count to the cap and sets count_capped', async () => {
      const state = await getExposureState(moderator.id)
      expect(state.count).toBe(EXPOSURE_COUNT_DISPLAY_CAP)
      expect(state.count_capped).toBe(true)
    })

    it('keeps the threshold row exact when rows beyond the read limit exist', async () => {
      const state = await getExposureState(moderator.id)
      expect(state.threshold).toBe(EXPOSURE_BREAK_THRESHOLD)
      expect(state.in_cooldown).toBe(true)
      expect(state.cooldown_ends_at).toBe(expectedCooldownEnd(thresholdAt))
    })
  })
})
