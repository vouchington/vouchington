import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  deleteReferralAttributionsByIds,
  insertAnonymousReferralAttributionForSessionAt,
} from '@voucha/test-helpers'
import { getNetworkEffects } from './get-network-effects.mts'

describe('getNetworkEffects', () => {
  it('counts a pair in the period of its earliest attribution only', async () => {
    const referrer = await createTestUserDirect()
    const now = new Date()
    const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
    const periodStart = new Date(monthEnd - 20_000)
    const olderSessionId = crypto.randomUUID()
    const ids: string[] = []
    try {
      ids.push(
        await insertAnonymousReferralAttributionForSessionAt(
          crypto.randomUUID(),
          referrer.id,
          new Date(periodStart.getTime() + 1_000),
        ),
      )
      ids.push(
        await insertAnonymousReferralAttributionForSessionAt(
          olderSessionId,
          referrer.id,
          new Date(periodStart.getTime() - 1_000),
        ),
      )
      const beforeDuplicate = await getNetworkEffects('all', periodStart)
      expect(beforeDuplicate.referral_coefficient).toBeGreaterThan(0)

      ids.push(
        await insertAnonymousReferralAttributionForSessionAt(
          olderSessionId,
          referrer.id,
          new Date(periodStart.getTime() + 2_000),
        ),
      )

      const afterDuplicate = await getNetworkEffects('all', periodStart)
      expect(afterDuplicate.referral_coefficient - beforeDuplicate.referral_coefficient).toBe(0)
    } finally {
      await deleteReferralAttributionsByIds(ids)
    }
  })
})
