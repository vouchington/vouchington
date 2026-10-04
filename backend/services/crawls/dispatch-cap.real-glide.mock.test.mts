import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  createTestPost,
  insertTestPostRelatedUrlBatch,
  insertTestUrlDirect,
  setTestRobotsTxtCache,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { crawlHostnamesQueue } from '@queues/crawl-hostnames/queues'
import { crawlUrls } from '@queues/crawler/queues'
import { crawlDispatchConfig } from './work-limits.mts'
import { dispatchCrawlUrlsPerHostname } from './dispatch-per-hostname.mts'
import type { CrawlDispatchCursor } from '@queues/crawl-hostnames/types'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { dispatchTier1CrawlUrls, dispatchTier2CrawlUrls } from './dispatch-tier-urls.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('bounded crawl URL dispatch', () => {
  afterAll(() => Promise.all([crawlHostnamesQueue.close(), crawlUrls.close()]))
  it.each([1, 2] as const)('resumes Tier %s past still-eligible queued URLs', async tier => {
    const owner = await createTestUser()
    const hostname = `bounded-tier-${randomUUID()}.example.com`
    const host = (await insertTestUrlDirect(owner.id, `https://${hostname}/base`))!.hostname
    await updateUrlHostname(host.id, { crawlable: true })
    await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
    const post = await createTestPost({ user: owner })
    const time = new Date(Date.UTC(2020, 0, 1) + Math.floor(Math.random() * 30_000_000_000))
    const lowerId = getMinUUIDv7ForDate(time)
    const ids = [1, 2, 3].map(index => lowerId.slice(0, -12) + String(index).padStart(12, '0'))
    await insertTestPostRelatedUrlBatch({
      postIds: ids.map(() => post.id),
      urlIds: ids,
      hostname,
      hostnameId: host.id,
      createdById: owner.id,
      votesScoreUp: tier === 1 ? 1 : 0,
    })
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, { batch_size: 1, max_rows_per_run: 1 })
    const cursor = { sweepStartedAt: new Date(time.getTime() + 1).toISOString(), afterId: lowerId }
    const dispatch = tier === 1 ? dispatchTier1CrawlUrls : dispatchTier2CrawlUrls
    expect(await dispatch(cursor)).toEqual({ count: 1, hasMore: true })
    const jobs = await crawlHostnamesQueue.searchJobs({
      name: tier === 1 ? 'crawl_tier1_dispatcher' : 'crawl_tier2_dispatcher',
    })
    const saved = jobs
      .map(job => (job.data as { cursor?: CrawlDispatchCursor }).cursor)
      .find(cursor => cursor?.afterId === ids[0])!
    expect(saved).toBeDefined()
    expect(await dispatch(saved)).toEqual({ count: 1, hasMore: true })
    expect(await dispatch({ ...saved, afterId: ids[1] })).toEqual({ count: 1, hasMore: false })
    for (const url_id of ids)
      expect(await crawlUrls.searchJobs({ name: 'crawl_url', data: { url_id } })).toHaveLength(1)
  })

  it('advances past still-eligible rows and excludes later inserts until the next sweep', async () => {
    const owner = await createTestUser()
    const hostname = `bounded-crawl-${randomUUID()}.example.com`
    await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
    const urls: NonNullable<Awaited<ReturnType<typeof insertTestUrlDirect>>>[] = []
    for (let index = 0; index < 3; index++) {
      urls.push((await insertTestUrlDirect(owner.id, `https://${hostname}/${index}`))!)
    }
    const hostnameId = urls[0]!.hostname.id
    await updateUrlHostname(hostnameId, { crawlable: true })
    await updateUrlHostnameBlocked(hostnameId, false)
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, { batch_size: 1, max_rows_per_run: 1 })
    expect(await dispatchCrawlUrlsPerHostname(hostnameId)).toEqual({ count: 1, hasMore: true })
    const continuationJobs = () =>
      crawlHostnamesQueue.searchJobs({
        name: 'crawl_urls_per_hostname_dispatcher',
        data: { hostname_id: hostnameId },
      })
    const first = (await continuationJobs()).find(
      job => (job.data as { cursor?: CrawlDispatchCursor }).cursor?.afterId === urls[0]!.id,
    )!
    expect(first).toBeDefined()
    const cursor = (first.data as { cursor: CrawlDispatchCursor }).cursor as CrawlDispatchCursor
    const later = (await insertTestUrlDirect(owner.id, `https://${hostname}/later`))!
    expect(await dispatchCrawlUrlsPerHostname(hostnameId, cursor)).toEqual({
      count: 1,
      hasMore: true,
    })
    expect(
      await dispatchCrawlUrlsPerHostname(hostnameId, { ...cursor, afterId: urls[1]!.id }),
    ).toEqual({ count: 1, hasMore: false })
    for (const url of urls) {
      expect(
        await crawlUrls.searchJobs({ name: 'crawl_url', data: { url_id: url.id } }),
      ).toHaveLength(1)
    }
    expect(await crawlUrls.searchJobs({ name: 'crawl_url', data: { url_id: later.id } })).toEqual(
      [],
    )
  })
})
