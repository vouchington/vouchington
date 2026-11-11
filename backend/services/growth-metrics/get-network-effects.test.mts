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
    const periodStart = new Date(Date.UTC(9000, 5, 1))
    const olderSessionId = crypto.randomUUID()
    const ids: string[] = []
    try {
      ids.push(
        await insertAnonymousReferralAttributionForSessionAt(
          crypto.randomUUID(),
          referrer.id,
          new Date(Date.UTC(9000, 6, 1)),
        ),
      )
      ids.push(
        await insertAnonymousReferralAttributionForSessionAt(
          olderSessionId,
          referrer.id,
          new Date(Date.UTC(9000, 0, 1)),
        ),
      )
      const beforeDuplicate = await getNetworkEffects('all', periodStart)
      expect(beforeDuplicate.referral_coefficient).toBeGreaterThan(0)

      ids.push(
        await insertAnonymousReferralAttributionForSessionAt(
          olderSessionId,
          referrer.id,
          new Date(Date.UTC(9000, 6, 2)),
        ),
      )

      const afterDuplicate = await getNetworkEffects('all', periodStart)
      expect(afterDuplicate.referral_coefficient).toBe(beforeDuplicate.referral_coefficient)
    } finally {
      await deleteReferralAttributionsByIds(ids)
    }
  })
})
