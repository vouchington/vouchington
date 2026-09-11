import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDateFromUUIDv7, getMinUUIDv7ForDate } from '@modules/utils/ids'
import {
  PLAYWRIGHT_SEED_CRAWL_ANCHOR_ENV,
  pinPlaywrightSeedCrawlAnchor,
  recentSeedCrawlId,
} from './crawl-ids.mts'

describe('recentSeedCrawlId', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('keeps seed and test crawl IDs stable across UTC midnight', () => {
    const seedId = recentSeedCrawlId(2, new Date('2026-05-31T23:57:00.000Z'))
    const testId = recentSeedCrawlId(2, new Date('2026-06-01T00:04:00.000Z'))

    expect(testId).toBe(seedId)
  })

  it('advances to the new UTC day after the rollover guard window', () => {
    const beforeRollover = recentSeedCrawlId(2, new Date('2026-06-01T00:04:00.000Z'))
    const afterRollover = recentSeedCrawlId(2, new Date('2026-06-01T12:01:00.000Z'))

    expect(afterRollover).not.toBe(beforeRollover)
  })

  it('keeps one anchor for the full Playwright run across the daily rollover', () => {
    vi.useFakeTimers()
    vi.stubEnv(PLAYWRIGHT_SEED_CRAWL_ANCHOR_ENV, undefined)
    vi.setSystemTime('2026-06-01T11:59:00.000Z')
    pinPlaywrightSeedCrawlAnchor()
    const seedId = recentSeedCrawlId(2)

    vi.setSystemTime('2026-06-01T12:01:00.000Z')

    expect(recentSeedCrawlId(2)).toBe(seedId)
  })

  it('stays inside the web-search recency window at a 31-day-month end', () => {
    const now = new Date('2026-08-31T00:16:00.000Z')
    const crawlId = recentSeedCrawlId(2, now)
    const cutoff = getMinUUIDv7ForDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))

    expect(getDateFromUUIDv7(crawlId)).toEqual(new Date('2026-08-30T00:00:00.000Z'))
    expect(crawlId.localeCompare(cutoff)).toBeGreaterThanOrEqual(0)
  })
})
