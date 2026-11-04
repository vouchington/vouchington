import { randomUUID } from 'node:crypto'
import { mintUUIDv7 } from '@modules/utils/ids'
import { describe, expect, it } from 'vitest'
import { addUrl } from '@services/urls'
import { beginTransaction, insertTestUrl, insertTestUrlHostname } from '@voucha/test-helpers'
import {
  deleteTestCrawlStateUrl,
  insertTestCrawlStateUrl,
  moveTestCrawlStateUrl,
  readTestCrawlRefreshState,
  readTestCrawlStateOwner,
  setTestCrawlStateHostname,
} from '@voucha/test-helpers/entities/crawl-refresh-state'

describe('URL crawl-state integrity', () => {
  it('creates null crawl state for both service and raw URL insertions', async () => {
    const hostname = `crawl-state-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const rawId = await insertTestUrl({ hostnameId, url: `https://${hostname}/raw` })
    const service = await addUrl(null, `https://${hostname}/service`)
    expect(service).not.toBeNull()
    for (const urlId of [rawId, service!.id]) {
      expect(await readTestCrawlStateOwner(urlId)).toEqual({
        url_id: urlId,
        hostname_id: hostnameId,
      })
      expect(await readTestCrawlRefreshState(urlId)).toEqual({
        last_crawl_attempt_at: null,
        last_successful_crawl_at: null,
      })
    }
  })

  it('enforces hostname ownership and cascades URL hostname changes and deletion', async () => {
    const hostname = `crawl-state-owner-${randomUUID()}.example.com`
    const nextHostname = `crawl-state-next-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const nextHostnameId = await insertTestUrlHostname({ hostname: nextHostname })
    const urlId = await insertTestUrl({ hostnameId, url: `https://${hostname}/` })
    await expect(setTestCrawlStateHostname(urlId, nextHostnameId)).rejects.toMatchObject({
      code: '23503',
    })
    expect((await readTestCrawlStateOwner(urlId))?.hostname_id).toBe(hostnameId)
    await moveTestCrawlStateUrl(urlId, nextHostnameId, `https://${nextHostname}/`)
    expect(await readTestCrawlStateOwner(urlId)).toEqual({
      url_id: urlId,
      hostname_id: nextHostnameId,
    })
    await deleteTestCrawlStateUrl(urlId)
    expect(await readTestCrawlStateOwner(urlId)).toBeNull()
  })

  it('rolls back an inserted URL and its trigger-created crawl state together', async () => {
    const hostname = `crawl-state-rollback-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlId = mintUUIDv7()
    {
      await using transaction = await beginTransaction()
      const options = { query: transaction }
      await insertTestCrawlStateUrl(urlId, hostnameId, `https://${hostname}/`, options)
      expect(await readTestCrawlStateOwner(urlId, options)).toEqual({
        url_id: urlId,
        hostname_id: hostnameId,
      })
    }
    expect(await readTestCrawlStateOwner(urlId)).toBeNull()
  })
})
