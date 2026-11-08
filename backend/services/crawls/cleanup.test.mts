import { it, expect, describe } from 'vitest'
import {
  createRandomString,
  insertTestUrlHostname,
  insertTestUrl,
  insertOldInvalidCrawlForTest,
  getCrawlData,
} from '@voucha/test-helpers'
import { getDateFromUUIDv7 } from '@modules/utils'
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
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, { cleanup_age_days: 30 })
    await expect(deleteOldInvalidCrawls({ ids, limit: 1 })).resolves.toEqual({
      deleted: 1,
      hasMore: true,
    })
    expect(
      (await Promise.all(ids.map(id => getCrawlData(urlId, id)))).filter(Boolean),
    ).toHaveLength(1)
    await expect(deleteOldInvalidCrawls({ ids, limit: 1 })).resolves.toEqual({
      deleted: 1,
      hasMore: true,
    })
    await expect(deleteOldInvalidCrawls({ ids, limit: 1 })).resolves.toEqual({
      deleted: 0,
      hasMore: false,
    })
    expect(await getCrawlData(urlId, neighborId)).toEqual(neighborBefore)
  })

  it('caps a configured age above 30 days before deleting a page', async () => {
    const hostname = `${createRandomString(12)}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlId = await insertTestUrl({ hostnameId, url: `https://${hostname}/age` })
    const id = await insertOldInvalidCrawlForTest(urlId)
    const neighborId = await insertOldInvalidCrawlForTest(urlId)
    const neighborBefore = await getCrawlData(urlId, neighborId)
    expect(neighborBefore).toBeDefined()
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, { cleanup_age_days: 31 })
    expect(getCrawlCleanupLimits().ageDays).toBe(30)
    await expect(deleteOldInvalidCrawls({ ids: [id], limit: 1 })).resolves.toEqual({
      deleted: 1,
      hasMore: true,
    })
    await expect(deleteOldInvalidCrawls({ ids: [id], limit: 1 })).resolves.toEqual({
      deleted: 0,
      hasMore: false,
    })
    expect(await getCrawlData(urlId, neighborId)).toEqual(neighborBefore)
  })

  it('defaults to 30 days when the runtime age field is absent', () => {
    const restore = deleteDynamicConfigFieldsForTest(crawlDispatchConfig, ['cleanup_age_days'])
    try {
      expect(getCrawlCleanupLimits().ageDays).toBe(30)
    } finally {
      restore()
    }
  })

  it('deletes abandoned crawls just before the configured age cutoff', async () => {
    const hostname = `${createRandomString(12)}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlId = await insertTestUrl({ hostnameId, url: `https://${hostname}/abandoned` })
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, { cleanup_age_days: 30 })
    const cutoffId = getCrawlCleanupCutoff()
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
