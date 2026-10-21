import { it, expect, describe } from 'vitest'
import {
  createRandomString,
  insertTestUrlHostname,
  insertTestUrl,
  insertOldInvalidCrawlForTest,
  getCrawlData,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { crawlDispatchConfig } from './work-limits.mts'
import { deleteOldInvalidCrawls } from './cleanup.mts'

describe('invalid crawl cleanup bounds', () => {
  it('deletes only its allowance and converges on subsequent runs', async () => {
    const hostname = `${createRandomString(12)}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlId = await insertTestUrl({ hostnameId, url: `https://${hostname}/cleanup` })
    const ids = await Promise.all([
      insertOldInvalidCrawlForTest(urlId),
      insertOldInvalidCrawlForTest(urlId),
    ])
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, {
      cleanup_batch_size: 1,
      cleanup_max_batches_per_run: 1,
      cleanup_age_days: 30,
    })
    await expect(deleteOldInvalidCrawls({ ids })).resolves.toEqual({ deleted: 1, hasMore: true })
    expect(
      (await Promise.all(ids.map(id => getCrawlData(urlId, id)))).filter(Boolean),
    ).toHaveLength(1)
    await expect(deleteOldInvalidCrawls({ ids })).resolves.toEqual({ deleted: 1, hasMore: true })
    await expect(deleteOldInvalidCrawls({ ids })).resolves.toEqual({ deleted: 0, hasMore: false })
  })

  it('applies the configured age cutoff before deleting a page', async () => {
    const hostname = `${createRandomString(12)}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlId = await insertTestUrl({ hostnameId, url: `https://${hostname}/age` })
    const id = await insertOldInvalidCrawlForTest(urlId)
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, { cleanup_age_days: 60 })
    await expect(deleteOldInvalidCrawls({ ids: [id] })).resolves.toEqual({
      deleted: 0,
      hasMore: false,
    })
    expect(await getCrawlData(urlId, id)).toBeDefined()
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, { cleanup_age_days: 30 })
    await expect(deleteOldInvalidCrawls({ ids: [id] })).resolves.toMatchObject({ deleted: 1 })
  })
})
