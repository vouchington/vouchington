import { describe, expect, it } from 'vitest'
import { resolveCrawlDispatchPageLimits } from './work-limits.mts'

describe('crawl dispatch page limits', () => {
  it('keeps an explicit page inside the dispatch bounds', () => {
    expect(resolveCrawlDispatchPageLimits({ batchSize: 1, maxRows: 1 })).toEqual({
      batchSize: 1,
      maxRows: 1,
    })
  })

  it('rejects an explicit page outside the positive dispatch bounds', () => {
    const message = 'Crawl dispatch page limits must be positive safe integers'
    expect(() => resolveCrawlDispatchPageLimits({ batchSize: 0, maxRows: 1 })).toThrow(message)
    expect(() => resolveCrawlDispatchPageLimits({ batchSize: 5_001, maxRows: 1 })).toThrow(message)
    expect(() => resolveCrawlDispatchPageLimits({ batchSize: 1, maxRows: 100_001 })).toThrow(
      message,
    )
    expect(() => resolveCrawlDispatchPageLimits({ batchSize: 1.5, maxRows: 1 })).toThrow(message)
  })
})
