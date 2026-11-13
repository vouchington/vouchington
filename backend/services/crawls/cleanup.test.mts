import { it, expect, describe, vi } from 'vitest'
import {
  createRandomString,
  insertTestUrlHostname,
  insertTestUrl,
  insertOldInvalidCrawlForTest,
  getCrawlData,
} from '@voucha/test-helpers'
import { getDateFromUUIDv7, getMinUUIDv7ForDate } from '@modules/utils'
import { getTestCrawlPreviousMonthInstant } from '@voucha/test-helpers/crawl-fixture-time'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { crawlDispatchConfig, getCrawlCleanupLimits } from './work-limits.mts'
import { deleteOldInvalidCrawls, getCrawlCleanupCutoff } from './cleanup.mts'

describe('invalid crawl cleanup bounds', () => {
  it('deletes only its allowance and converges on subsequent runs', async () => {
    const hostname = `${createRandomString(12)}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlId = await insertTestUrl({ hostnameId, url: `https://${hostname}/cleanup` })
    const ids = await Promise.all([
      insertOldInvalidCrawlForTest(urlId),
      insertOldInvalidCrawlForTest(urlId),
    ])
    const neighborId = await insertOldInvalidCrawlForTest(urlId)
    const neighborBefore = await getCrawlData(urlId, neighborId)
    expect(neighborBefore).toBeDefined()
    const cutoffId = getMinUUIDv7ForDate(new Date(getTestCrawlPreviousMonthInstant().getTime() + 1))
    await expect(deleteOldInvalidCrawls({ cutoffId, ids, limit: 1 })).resolves.toEqual({
      deleted: 1,
      hasMore: true,
    })
    expect(
      (await Promise.all(ids.map(id => getCrawlData(urlId, id)))).filter(Boolean),
    ).toHaveLength(1)
    await expect(deleteOldInvalidCrawls({ cutoffId, ids, limit: 1 })).resolves.toEqual({
      deleted: 1,
      hasMore: true,
    })
    await expect(deleteOldInvalidCrawls({ cutoffId, ids, limit: 1 })).resolves.toEqual({
      deleted: 0,
      hasMore: false,
    })
    expect(await getCrawlData(urlId, neighborId)).toEqual(neighborBefore)
  })

  it.each([
    ['2027-03-01T12:00:00.000Z', '2027-01-30T12:00:00.000Z'],
    ['2028-03-01T12:00:00.000Z', '2028-01-31T12:00:00.000Z'],
    ['2027-01-01T12:00:00.000Z', '2026-12-02T12:00:00.000Z'],
  ])('keeps the production default and capped cutoff thirty days before %s', (now, expected) => {
    const restore = deleteDynamicConfigFieldsForTest(crawlDispatchConfig, ['cleanup_age_days'])
    try {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(now))
      expect(getCrawlCleanupLimits().ageDays).toBe(30)
      expect(getDateFromUUIDv7(getCrawlCleanupCutoff())?.toISOString()).toBe(expected)
      const restoreCap = overrideDynamicConfigFieldsForTest(crawlDispatchConfig, {
        cleanup_age_days: 31,
      })
      try {
        expect(getCrawlCleanupLimits().ageDays).toBe(30)
        expect(getDateFromUUIDv7(getCrawlCleanupCutoff())?.toISOString()).toBe(expected)
      } finally {
        restoreCap()
      }
    } finally {
      vi.useRealTimers()
      restore()
    }
  })

  it('deletes abandoned crawls just before an owned cutoff', async () => {
    const hostname = `${createRandomString(12)}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlId = await insertTestUrl({ hostnameId, url: `https://${hostname}/abandoned` })
    const cutoffId = getMinUUIDv7ForDate(getTestCrawlPreviousMonthInstant())
    const cutoffAt = getDateFromUUIDv7(cutoffId)
    if (!cutoffAt) throw new Error('Crawl cleanup cutoff must be a UUIDv7')

    const oldId = await insertOldInvalidCrawlForTest(urlId, {
      startedAt: new Date(cutoffAt.getTime() - 1),
      networkError: null,
    })
    const recentId = await insertOldInvalidCrawlForTest(urlId, {
      startedAt: new Date(cutoffAt.getTime() + 1),
      networkError: null,
    })
    const neighborId = await insertOldInvalidCrawlForTest(urlId, {
      startedAt: new Date(cutoffAt.getTime() - 2),
      networkError: null,
    })
    const neighborBefore = await getCrawlData(urlId, neighborId)
    expect(neighborBefore).toBeDefined()

    await expect(
      deleteOldInvalidCrawls({ cutoffId, ids: [oldId, recentId], limit: 2 }),
    ).resolves.toEqual({
      deleted: 1,
      hasMore: false,
    })
    expect(await getCrawlData(urlId, oldId)).toBeUndefined()
    expect(await getCrawlData(urlId, recentId)).toBeDefined()
    expect(await getCrawlData(urlId, neighborId)).toEqual(neighborBefore)
  })
})
