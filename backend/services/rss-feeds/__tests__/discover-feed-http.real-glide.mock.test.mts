import { randomUUID } from 'node:crypto'
import { Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../../../data-stores/valkey-glide-mq/index.mts'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { CRAWL_URLS_QUEUE_NAME } from '@queues/crawler/config'
import {
  IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB,
  IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB,
} from '@queues/background/enqueues/imports-jobs'
import { enqueueUserRssFeedImportDispatch } from '@queues/user-rss-feed-imports/enqueues'
import { dispatchUserRssFeedImport } from '../../user-import-export/rss-feed-import-dispatch.mts'
import {
  getRssFeedImport,
  processRssFeedImportRow,
  submitRssFeedImport,
} from '../../user-import-export/rss-feed-imports.mts'
import { processCrawlerJob } from '../../../workers/crawler/processors.mts'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import {
  getFirstRssFeedImportRowId,
  getRssFeedImportDiscoveryForTest,
  getRssFeedUrlForTest,
} from '@voucha/test-helpers/rss-feed-import-rows'
import type { CrawlerHtmlResult } from '../../crawler-html/index.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

async function runHtmlImport(links: NonNullable<CrawlerHtmlResult['content']>['links']) {
  const user = await createTestUser()
  const hostname = `discovery-${randomUUID()}.example.com`
  const pageUrl = `https://${hostname}/blog`
  const feedUrl = `https://${hostname}/feed.xml`
  const submitted = await submitRssFeedImport(user, WEB_PROVENANCE, [pageUrl])
  const rowId = await getFirstRssFeedImportRowId(submitted.import.id)
  const crawlCompleted = Promise.withResolvers<Job>()
  const rowSettled = Promise.withResolvers<void>()
  let rowRuns = 0
  const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  const crawler = new Worker(
    CRAWL_URLS_QUEUE_NAME,
    (job: Job) =>
      processCrawlerJob(job, {
        resolveDnsCanary: async () => undefined,
        resolveSafeCrawlerAddresses: async () => [{ address: '93.184.216.34', family: 4 }],
        fetchCrawlerHtml: async (): Promise<CrawlerHtmlResult> => ({
          response_status_code: 200,
          request_headers: { 'User-Agent': 'test' },
          response_headers: { 'content-type': 'text/html' },
          crawl_started_at: new Date(),
          crawl_completed_at: new Date(),
          content: { title: 'Blog', content: 'Blog', meta: {}, links: links ?? {} },
        }),
      }),
    { ...connection, blockTimeout: 1000, promotionInterval: 50 },
  )
  const background = new Worker(
    BACKGROUND_QUEUE_NAME,
    (job: Job) => {
      if (job.name === IMPORTS_DISPATCH_USER_RSS_FEED_IMPORT_JOB.name)
        return dispatchUserRssFeedImport(job.data as { importId: string })
      if (job.name === IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB.name)
        return processRssFeedImportRow(submitted.import.id, rowId, {
          crawlerRssOptions: {
            dependencies: {
              fetchUrl: async ({ url }) => ({
                response:
                  url === pageUrl
                    ? new Response('<html><head></head><body>Blog</body></html>', {
                        headers: { 'content-type': 'text/html' },
                      })
                    : new Response(
                        '<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><link>https://example.com/</link><description>Feed</description></channel></rss>',
                        { headers: { 'content-type': 'application/rss+xml' } },
                      ),
                responseSignal: new AbortController().signal,
              }),
            },
          },
        })
      throw new Error(`Unexpected background job ${job.name}`)
    },
    { ...connection, blockTimeout: 1000, promotionInterval: 50 },
  )
  crawler.on('error', error => crawlCompleted.reject(error))
  crawler.on('failed', (job, error) => {
    if (job?.data?.import_row_id === rowId) crawlCompleted.reject(error)
  })
  crawler.on('completed', job => {
    if (job.data?.import_row_id === rowId) crawlCompleted.resolve(job)
  })
  background.on('error', error => rowSettled.reject(error))
  const onRowFinished = (job: Job) => {
    if (job.data?.rowId !== rowId) return
    rowRuns += 1
    if (rowRuns === 2) rowSettled.resolve()
  }
  background.on('completed', onRowFinished)
  background.on('failed', job => {
    if (job) onRowFinished(job)
  })
  try {
    await Promise.all([crawler.waitUntilReady(), background.waitUntilReady()])
    await enqueueUserRssFeedImportDispatch(submitted.import.id)
    const crawlJob = await crawlCompleted.promise
    await rowSettled.promise
    const status = await getRssFeedImport(user.id, submitted.import.id)
    const discovery = await getRssFeedImportDiscoveryForTest(rowId)
    const createdFeedUrl = status?.rows[0]?.entity_id
      ? await getRssFeedUrlForTest(status.rows[0].entity_id)
      : null
    return { crawlJob, rowId, status, discovery, feedUrl, createdFeedUrl }
  } finally {
    await Promise.all([background.close(true), crawler.close(true)])
  }
}

describe('HTML RSS discovery continuation', () => {
  it('runs the dispatcher, HTML crawler, and resumed row to a created source', async () => {
    const result = await runHtmlImport({ alternate: { 'application/rss+xml': '/feed.xml' } })
    expect(result.crawlJob.data.import_row_id).toBe(result.rowId)
    expect(result.discovery.discovery_crawl_id).toEqual(expect.any(String))
    expect(result.discovery.discovered_feed_url).toBe(result.feedUrl)
    expect(result.status?.rows).toMatchObject([
      {
        status: 'source_created',
        entity_id: expect.any(String),
        topic_slug: expect.any(String),
      },
    ])
    expect(result.createdFeedUrl).toBe(result.feedUrl)
  })

  it('finishes with a safe error code when the crawled page has no feed link', async () => {
    const result = await runHtmlImport({})
    expect(result.crawlJob.data.import_row_id).toBe(result.rowId)
    expect(result.discovery.discovery_crawl_id).toEqual(expect.any(String))
    expect(result.discovery.discovered_feed_url).toBeNull()
    expect(result.status?.rows).toMatchObject([
      { status: 'error', error_code: 'INVALID_FEED_CONTENT' },
    ])
    expect(result.createdFeedUrl).toBeNull()
  })
})
