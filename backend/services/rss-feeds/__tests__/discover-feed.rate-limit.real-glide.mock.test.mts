import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { QueueEvents, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import {
  closeAndUnregisterGlideMQInstance,
  workerQueueConnection,
  workerQueuePrefix,
} from '../../../data-stores/valkey-glide-mq/index.mts'
import { CrawlerRateLimitError } from '@modules/on-error/errors'
import { IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB } from '@queues/background/enqueues/imports-jobs'
import { background } from '@queues/background/queues'
import { CRAWL_URLS_QUEUE_NAME } from '@queues/crawler/config'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { crawlUrls } from '@queues/crawler/queues'
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
import { processCrawlerJob } from '../../../workers/crawler/processors.mts'
import { discoverFeedUrlFromHtml } from '../discover-feed.mts'
import { RssFeedDiscoveryPendingError } from '../discovery-pending.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('RSS import crawl rate-limit deferral', () => {
  it('keeps the original generation job while recovery re-enqueues during Retry-After', async () => {
    const user = await createTestUser()
    const hostname = `crawler-import-${randomUUID()}.example.com`
    const pageUrl = `https://${hostname}/blog`
    const feedUrl = `https://${hostname}/feed.xml`
    const hostnameId = await insertTestUrlHostname({ hostname, is_crawlable: true })
    const urlId = await insertTestUrl({ hostnameId, url: pageUrl })
    await insertTestCrawler({ hostnameId, description: 'Rate-limited RSS discovery' })
    const { rowId, generation } = await createPendingRssFeedImportDiscoveryForTest(
      user.id,
      pageUrl,
      urlId,
    )
    const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
    const events = new QueueEvents(CRAWL_URLS_QUEUE_NAME, { ...connection, blockTimeout: 1_000 })
    let fetches = 0
    let queuePaused = false
    let ownedJob: Job | null | undefined
    const worker = new Worker(
      CRAWL_URLS_QUEUE_NAME,
      (job: Job) =>
        processCrawlerJob(job, {
          resolveDnsCanary: async () => undefined,
          resolveSafeCrawlerAddresses: async () => [{ address: '93.184.216.34', family: 4 }],
          fetchCrawlerHtml: async () => {
            fetches += 1
            if (fetches === 1) {
              await crawlUrls.pause()
              queuePaused = true
              throw new CrawlerRateLimitError(pageUrl, 429, 10, 100)
            }
            return {
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
            }
          },
        }),
      { ...connection, concurrency: 1, blockTimeout: 1_000, promotionInterval: 50 },
    )
    try {
      await Promise.all([events.waitUntilReady(), worker.waitUntilReady()])
      const firstOutcome = Promise.race([
        once(events, 'delay-changed').then(([event]) => ({ kind: 'delayed', event })),
        once(events, 'completed').then(([event]) => ({ kind: 'completed', event })),
        once(events, 'failed').then(([event]) => ({ kind: 'failed', event })),
      ])
      const completed = once(events, 'completed')
      const [job] = await enqueueBulkCrawlUrls(
        [
          {
            urlId,
            options: {
              importRowId: rowId,
              importDiscoveryGeneration: generation,
              ignoreRobotsTxt: true,
            },
          },
        ],
        { hostnameId, rateLimitMs: 1_000 },
      )
      if (!job) throw new Error('Expected an import discovery crawl job')
      ownedJob = job
      expect(await firstOutcome).toEqual({
        kind: 'delayed',
        event: expect.objectContaining({ jobId: job.id }),
      })
      const deferred = await crawlUrls.getJob(job.id)
      expect(await deferred?.getState()).toBe('delayed')
      expect(deferred?.attemptsMade).toBe(0)
      await expect(discoverFeedUrlFromHtml(pageUrl, rowId)).rejects.toBeInstanceOf(
        RssFeedDiscoveryPendingError,
      )
      expect((await getRssFeedImportDiscoveriesForTest(rowId))[0]?.generation).toBe(generation)
      expect(
        (await crawlUrls.searchJobs({ name: 'crawl_url', data: { import_row_id: rowId } })).map(
          candidate => candidate.id,
        ),
      ).toEqual([job.id])
      await crawlUrls.resume()
      queuePaused = false
      expect((await completed)[0]).toMatchObject({ jobId: job.id })
      expect(fetches).toBe(2)
      expect(await getRssFeedImportDiscoveriesForTest(rowId)).toMatchObject([
        { discovery_url_id: urlId, generation, discovered_feed_url: feedUrl, failed_at: null },
      ])
    } finally {
      if (queuePaused) await crawlUrls.resume()
      await Promise.all([worker.close(true), events.close()])
      if (ownedJob) await ownedJob.remove()
      const retriedJobs = await crawlUrls.searchJobs({
        name: 'crawl_url',
        data: { import_row_id: rowId },
        limit: 3,
      })
      for (const retriedJob of retriedJobs) await retriedJob.remove()
      const continuations = await background.searchJobs({
        name: IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB.name,
        data: { rowId },
        limit: 2,
      })
      for (const continuation of continuations) await continuation.remove()
      await Promise.all([
        closeAndUnregisterGlideMQInstance(crawlUrls),
        closeAndUnregisterGlideMQInstance(background),
      ])
    }
  })
})
