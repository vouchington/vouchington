import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  insertContributionAdmissionReservationForTest,
} from '@voucha/test-helpers'
import { getContributionAdmissionCapacityStatus } from './admission-capacity-status.mts'
import { recordContributionAdmissionConsumption } from './admission-quota.mts'
import type { ContributionPolicy } from './policy.mts'

const unlimited = { limit: -1, windowSeconds: 3_600 }

describe('contribution capacity window filtering', () => {
  it('selects the latest matching source and mode before applying the quota bound', async () => {
    const [actor, otherActor] = await Promise.all([createTestUser(), createTestUser()])
    const now = Date.now()
    await using query = await beginTransaction()
    for (const [actorId, source, ageSeconds, mode] of [
      [actor.id, 'discussion', 3_000, 'all_windows'],
      [actor.id, 'discussion', 1_200, 'all_windows'],
      [actor.id, 'discussion', 1_200, 'all_windows'],
      [actor.id, 'discussion', 4_000, 'all_windows'],
      [actor.id, 'discussion', 10, 'daily_only'],
      [actor.id, 'comment', 5, 'all_windows'],
      [otherActor.id, 'discussion', 1, 'all_windows'],
    ] as const) {
      await recordContributionAdmissionConsumption(
        query,
        await insertContributionAdmissionReservationForTest({ actorId }),
        actorId,
        source,
        new Date(now - ageSeconds * 1_000),
        mode,
      )
    }
    await query.commit()

    const policy: ContributionPolicy = {
      global: { short: unlimited, daily: unlimited },
      type: { short: { limit: 2, windowSeconds: 3_600 }, daily: unlimited },
    }
    const exhausted = await getContributionAdmissionCapacityStatus(actor.id, 'discussion', policy)
    expect(exhausted).toMatchObject({ allowed: false, reason: 'type_limit' })
    expect(exhausted.retryAfterSeconds).toBeGreaterThanOrEqual(2_380)
    expect(exhausted.retryAfterSeconds).toBeLessThanOrEqual(2_400)
    await expect(
      getContributionAdmissionCapacityStatus(actor.id, 'review', policy),
    ).resolves.toEqual({ allowed: true })
    await expect(
      getContributionAdmissionCapacityStatus(actor.id, 'discussion', {
        ...policy,
        type: { ...policy.type, short: { limit: 4, windowSeconds: 3_600 } },
      }),
    ).resolves.toEqual({ allowed: true })
  })

  it.each([
    { limit: -1, expected: { allowed: true } },
    { limit: 0, expected: { allowed: false, reason: 'type_limit', retryAfterSeconds: 1 } },
  ])('preserves empty-window capacity for limit $limit', async ({ limit, expected }) => {
    const actor = await createTestUser()
    await expect(
      getContributionAdmissionCapacityStatus(actor.id, 'discussion', {
        global: { short: unlimited, daily: unlimited },
        type: { short: { limit, windowSeconds: 3_600 }, daily: unlimited },
      }),
    ).resolves.toEqual(expected)
  })
})
