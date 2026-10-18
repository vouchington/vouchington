import { randomUUID } from 'node:crypto'
import { Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../../../data-stores/valkey-glide-mq/index.mts'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { BACKGROUND_CPU_QUEUE_NAME as CRAWL_URLS_QUEUE_NAME } from '@queues/background-cpu/config'
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
  getRssFeedImportDiscoveriesForTest,
  getRssFeedUrlForTest,
} from '@voucha/test-helpers/rss-feed-import-rows'
import type { CrawlerHtmlResult } from '../../crawler-html/index.mts'
import { completeRssFeedImportDiscovery, discoverFeedUrlFromHtml } from '../discover-feed.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

async function runHtmlImport(options: {
  hostname: string
  inputProtocol?: 'http:' | 'https:'
  htmlPages: Map<string, NonNullable<CrawlerHtmlResult['content']>['links']>
  expectedCrawls: number
  expectedRowRuns: number
}) {
  const user = await createTestUser()
  const { hostname } = options
  const pageUrl = `${options.inputProtocol ?? 'https:'}//${hostname}/blog`
  const feedUrl = `${options.inputProtocol === 'http:' ? 'http:' : 'https:'}//${hostname}/feed.xml`
  const submitted = await submitRssFeedImport(user, WEB_PROVENANCE, [pageUrl])
  const rowId = await getFirstRssFeedImportRowId(submitted.import.id)
  const crawlsSettled = Promise.withResolvers<Job[]>()
  const rowsSettled = Promise.withResolvers<void>()
  const crawlJobsByUrlId = new Map<string, Job>()
  const htmlFetchCounts = new Map<string, number>()
  let rowRuns = 0
  const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  const crawler = new Worker(
    CRAWL_URLS_QUEUE_NAME,
    (job: Job) =>
      processCrawlerJob(job, {
        resolveDnsCanary: async () => undefined,
        resolveSafeCrawlerAddresses: async () => [{ address: '93.184.216.34', family: 4 }],
        fetchCrawlerHtml: async ({ url }): Promise<CrawlerHtmlResult> => {
          if (!options.htmlPages.has(url)) throw new Error(`Unexpected HTML discovery URL ${url}`)
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
              links: options.htmlPages.get(url) ?? {},
            },
          }
        },
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
              fetchUrl: async ({ url }) => {
                let response: Response
                if (options.htmlPages.has(url)) {
                  const fetchCount = (htmlFetchCounts.get(url) ?? 0) + 1
                  htmlFetchCounts.set(url, fetchCount)
                  if (fetchCount > 1) throw new Error(`Original HTML page fetched again: ${url}`)
                  response = new Response('<html><head></head><body>Blog</body></html>', {
                    headers: { 'content-type': 'text/html' },
                  })
                } else {
                  response = new Response(
                    '<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><link>https://example.com/</link><description>Feed</description></channel></rss>',
                    { headers: { 'content-type': 'application/rss+xml' } },
                  )
                }
                return { response, responseSignal: new AbortController().signal }
              },
            },
          },
        })
      throw new Error(`Unexpected background job ${job.name}`)
    },
    { ...connection, blockTimeout: 1000, promotionInterval: 50 },
  )
  crawler.on('error', error => crawlsSettled.reject(error))
  crawler.on('failed', (job, error) => {
    if (job?.data?.import_row_id === rowId) crawlsSettled.reject(error)
  })
  crawler.on('completed', job => {
    if (job.data?.import_row_id !== rowId) return
    const urlId = job.data?.url_id
    if (typeof urlId !== 'string') {
      crawlsSettled.reject(new Error('Discovery crawl completed without its URL ID'))
      return
    }
    crawlJobsByUrlId.set(urlId, job)
    if (crawlJobsByUrlId.size === options.expectedCrawls)
      crawlsSettled.resolve([...crawlJobsByUrlId.values()])
  })
  background.on('error', error => rowsSettled.reject(error))
  const onRowFinished = (job: Job) => {
    if (job.data?.rowId !== rowId) return
    rowRuns += 1
    if (rowRuns === options.expectedRowRuns) rowsSettled.resolve()
  }
  background.on('completed', onRowFinished)
  background.on('failed', job => {
    if (job) onRowFinished(job)
  })
  try {
    await Promise.all([crawler.waitUntilReady(), background.waitUntilReady()])
    await enqueueUserRssFeedImportDispatch(submitted.import.id)
    const completedCrawls = await crawlsSettled.promise
    await rowsSettled.promise
    const status = await getRssFeedImport(user.id, submitted.import.id)
    const discoveries = await getRssFeedImportDiscoveriesForTest(rowId)
    const createdFeedUrl = status?.rows[0]?.entity_id
      ? await getRssFeedUrlForTest(status.rows[0].entity_id)
      : null
    return { crawlJobs: completedCrawls, rowId, status, discoveries, feedUrl, createdFeedUrl }
  } finally {
    await Promise.all([background.close(true), crawler.close(true)])
  }
}

describe('HTML RSS discovery continuation', () => {
  it('runs the dispatcher, HTML crawler, and resumed row to a created source', async () => {
    const hostname = `discovery-${randomUUID()}.example.com`
    const pageUrl = `https://${hostname}/blog`
    const sectionUrl = `https://${hostname}/section`
    const feedUrl = `https://${hostname}/feed.xml`
    const result = await runHtmlImport({
      hostname,
      htmlPages: new Map([
        [pageUrl, { alternate: { 'application/rss+xml': '/section' } }],
        [sectionUrl, { alternate: { 'application/rss+xml': '/feed.xml' } }],
      ]),
      expectedCrawls: 2,
      expectedRowRuns: 3,
    })
    expect(result.crawlJobs.map(job => job.data.import_row_id)).toEqual([
      result.rowId,
      result.rowId,
    ])
    expect(new Set(result.crawlJobs.map(job => job.data.url_id))).toEqual(
      new Set(result.discoveries.map(discovery => discovery.discovery_url_id)),
    )
    for (const job of result.crawlJobs) {
      expect(
        result.discoveries.find(discovery => discovery.discovery_url_id === job.data.url_id),
      ).toMatchObject({ generation: job.data.import_discovery_generation })
    }
    expect(result.discoveries).toMatchObject([
      { discovery_url: expect.stringMatching('/blog'), discovered_feed_url: sectionUrl },
      { discovery_url: expect.stringMatching('/section'), discovered_feed_url: feedUrl },
    ])
    const sectionDiscovery = result.discoveries.find(item => item.discovery_url === sectionUrl)!
    await expect(discoverFeedUrlFromHtml(sectionUrl, result.rowId)).resolves.toBe(feedUrl)
    await completeRssFeedImportDiscovery(
      result.rowId,
      sectionDiscovery.discovery_url_id,
      sectionDiscovery.generation,
      null,
    )
    await completeRssFeedImportDiscovery(
      result.rowId,
      sectionDiscovery.discovery_url_id,
      randomUUID(),
      null,
    )
    expect(await getRssFeedImportDiscoveriesForTest(result.rowId)).toMatchObject([
      { discovery_url: expect.stringMatching('/blog'), discovered_feed_url: sectionUrl },
      { discovery_url: sectionUrl, discovered_feed_url: feedUrl, failed_at: null },
    ])
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
    const hostname = `discovery-${randomUUID()}.example.com`
    const pageUrl = `https://${hostname}/blog`
    const result = await runHtmlImport({
      hostname,
      htmlPages: new Map([[pageUrl, {}]]),
      expectedCrawls: 1,
      expectedRowRuns: 2,
    })
    expect(result.crawlJobs[0]?.data.import_row_id).toBe(result.rowId)
    expect(result.discoveries).toMatchObject([
      {
        discovery_url: expect.stringMatching('/blog'),
        crawl_id: expect.any(String),
        failed_at: expect.any(Date),
      },
    ])
    expect(result.status?.rows).toMatchObject([
      { status: 'error', error_code: 'INVALID_FEED_CONTENT' },
    ])
    expect(result.createdFeedUrl).toBeNull()
  })

  it('does not treat an HTML page that links to itself as a feed', async () => {
    const hostname = `discovery-${randomUUID()}.example.com`
    const pageUrl = `https://${hostname}/blog`
    const result = await runHtmlImport({
      hostname,
      htmlPages: new Map([[pageUrl, { alternate: { 'application/rss+xml': '/blog' } }]]),
      expectedCrawls: 1,
      expectedRowRuns: 2,
    })
    expect(result.discoveries).toMatchObject([
      { discovery_url: expect.stringMatching('/blog'), discovered_feed_url: null },
    ])
    expect(result.status?.rows).toMatchObject([
      { status: 'error', error_code: 'INVALID_FEED_CONTENT' },
    ])
    expect(result.createdFeedUrl).toBeNull()
  })

  it('keeps HTTPS and HTTP fallback HTML outcomes for distinct page crawls', async () => {
    const hostname = `discovery-${randomUUID()}.example.com`
    const httpsPageUrl = `https://${hostname}/blog`
    const httpPageUrl = `http://${hostname}/blog`
    const result = await runHtmlImport({
      hostname,
      inputProtocol: 'http:',
      htmlPages: new Map([
        [httpsPageUrl, {}],
        [httpPageUrl, { alternate: { 'application/rss+xml': '/feed.xml' } }],
      ]),
      expectedCrawls: 2,
      expectedRowRuns: 3,
    })
    expect(new Set(result.crawlJobs.map(job => job.data.url_id)).size).toBe(2)
    expect(result.discoveries).toMatchObject([
      {
        discovery_url: httpPageUrl,
        discovered_feed_url: result.feedUrl,
        failed_at: null,
      },
      {
        discovery_url: httpsPageUrl,
        discovered_feed_url: null,
        failed_at: expect.any(Date),
      },
    ])
    expect(result.status?.rows).toMatchObject([
      { status: 'source_created', entity_id: expect.any(String) },
    ])
    expect(result.createdFeedUrl).toBe(`https://${hostname}/feed.xml`)
  })
})
