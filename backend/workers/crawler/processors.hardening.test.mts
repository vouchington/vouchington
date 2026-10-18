import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCrawler,
  insertTestUrl,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import {
  createPendingRssFeedImportDiscoveryForTest,
  getRssFeedImportDiscoveriesForTest,
} from '@voucha/test-helpers/rss-feed-import-rows'
import { getLatestCrawlCompletionForUrl } from '@voucha/test-helpers/entities/crawl-state'
import { processCrawlerJob } from './processors.mts'

describe('crawler RSS import discovery completion', () => {
  it.each([
    { rejection: 'an unstoreable feed URL', blocked: false },
    { rejection: 'a blocked feed hostname', blocked: true },
  ])('completes discovery when the persisted crawl exposes $rejection', async ({ blocked }) => {
    const currentUser = await createTestUser()
    const hostname = `crawler-discovery-${randomUUID()}.example.com`
    const pageUrl = `https://${hostname}/blog`
    const hostnameId = await insertTestUrlHostname({ hostname, is_crawlable: true })
    const urlId = await insertTestUrl({ hostnameId, url: pageUrl })
    await insertTestCrawler({ hostnameId, description: 'RSS import discovery' })
    const { rowId, generation } = await createPendingRssFeedImportDiscoveryForTest(
      currentUser.id,
      pageUrl,
      urlId,
    )
    // Both URLs are public; persistence rejects the long path or blocked hostname.
    const feedHostname = `t${randomUUID().replaceAll('-', '').slice(0, 8)}.io`
    if (blocked) await insertTestUrlHostname({ hostname: feedHostname, is_blocked: true })
    const feedUrl = `https://${feedHostname}/${blocked ? 'feed.xml' : 'a'.repeat(2048)}`
    const job = {
      attemptsMade: 0,
      name: 'crawl_url',
      opts: { attempts: 1 },
      data: {
        url_id: urlId,
        import_row_id: rowId,
        import_discovery_generation: generation,
        should_ignore_robots_txt: true,
        skip_canonical_url: true,
        skip_chunks: true,
        skip_embed_resolution: true,
      },
    } as Job

    await expect(
      processCrawlerJob(job, {
        resolveDnsCanary: async () => undefined,
        resolveSafeCrawlerAddresses: async () => [{ address: '93.184.216.34', family: 4 }],
        fetchCrawlerHtml: async () => ({
          response_status_code: 200,
          request_headers: { 'User-Agent': 'test' },
          response_headers: { 'content-type': 'text/html' },
          crawl_started_at: new Date(),
          crawl_completed_at: new Date(),
          content: {
            title: 'Blog',
            content: 'Blog',
            meta: {},
            links: { alternate: { 'application/rss+xml': feedUrl } },
          },
        }),
      }),
    ).resolves.toBeDefined()

    expect(await getLatestCrawlCompletionForUrl(urlId)).toEqual({
      completed: true,
      responseStatusCode: 200,
    })
    expect(await getRssFeedImportDiscoveriesForTest(rowId)).toMatchObject([
      {
        discovery_url_id: urlId,
        discovery_url: pageUrl,
        generation,
        crawl_id: expect.any(String),
        discovered_feed_url: null,
        failed_at: expect.any(Date),
      },
    ])
  })
})
