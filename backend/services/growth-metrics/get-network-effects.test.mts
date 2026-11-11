import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  deleteReferralAttributionsByIds,
  getReferralSummaryForReferrer,
  insertAnonymousReferralAttributionForSessionAt,
} from '@voucha/test-helpers'

describe('getNetworkEffects', () => {
  it('counts a pair in the period of its earliest attribution only', async () => {
    const referrer = await createTestUserDirect()
    const periodStart = new Date()
    const olderSessionId = crypto.randomUUID()
    const ids: string[] = []
    try {
      ids.push(
        await insertAnonymousReferralAttributionForSessionAt(
          olderSessionId,
          referrer.id,
          new Date(periodStart.getTime() - 10_000),
        ),
      )
      ids.push(
        await insertAnonymousReferralAttributionForSessionAt(
          olderSessionId,
          referrer.id,
          new Date(periodStart.getTime() + 20_000),
        ),
      )

      const summary = await getReferralSummaryForReferrer(referrer.id, periodStart)
      expect(summary).toEqual({ attributions: 0, unique_links: 0 })
    } finally {
      await deleteReferralAttributionsByIds(ids)
    }
  })
})
