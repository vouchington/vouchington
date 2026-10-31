import { describe, expect, it } from 'vitest'
import { resolveReferralCrawlPageLimits } from './work-limits.mts'

describe('referral crawl page limits', () => {
  it('keeps an explicit page inside the dispatch bounds', () => {
    expect(resolveReferralCrawlPageLimits({ batchSize: 1, maxRows: 1 })).toEqual({
      batchSize: 1,
      maxRows: 1,
    })
  })

  it('rejects an explicit page outside the positive dispatch bounds', () => {
    const message = 'Referral crawl page limits must be positive safe integers'
    expect(() => resolveReferralCrawlPageLimits({ batchSize: 0, maxRows: 1 })).toThrow(message)
    expect(() => resolveReferralCrawlPageLimits({ batchSize: 5_001, maxRows: 1 })).toThrow(message)
    expect(() => resolveReferralCrawlPageLimits({ batchSize: 1, maxRows: 100_001 })).toThrow(
      message,
    )
    expect(() => resolveReferralCrawlPageLimits({ batchSize: 1.5, maxRows: 1 })).toThrow(message)
  })
})
