import { createWorker } from '@data-stores/valkey-glide-mq'
import { beforeEach, describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { CRAWL_URLS_QUEUE_NAME } from './config.mts'
import { enqueueBulkCrawlUrls, enqueueCrawlUrlAndWait } from './enqueues.mts'
import { crawlUrls } from './queues.mts'

describe('enqueueBulkCrawlUrls', () => {
  beforeEach(async () => {
    await crawlUrls.obliterate({ force: true })
  })

  it('keeps bulk crawl jobs deduplicated by URL', async () => {
    await enqueueBulkCrawlUrls([{ urlId: 'url-1' }], {
      hostnameId: 'hostname-1',
      rateLimitMs: 1234,
    })

    const jobs = await readAllQueueJobs(crawlUrls)
    const job = jobs.find(j => (j.data as { url_id?: string }).url_id === 'url-1')
    expect(job).toBeDefined()
    expect(job!.opts).toMatchObject({
      priority: 10,
      deduplication: { id: 'crawl_url__url-1', mode: 'debounce', ttl: 1234 },
      ordering: { key: 'hostname-1', rateLimit: { max: 1, duration: 1234 } },
    })
  })
})

describe('enqueueCrawlUrlAndWait', () => {
  beforeEach(async () => {
    await crawlUrls.obliterate({ force: true })
  })

  it('enqueues immediate crawl jobs at highest priority without deduplication', async () => {
    const resultPromise = enqueueCrawlUrlAndWait(
      { urlId: 'url-2' },
      {
        crawlTimeoutMs: 10_000,
        ensureCrawlerForRedirects: true,
        hostnameId: 'hostname-2',
        ignoreRobotsTxt: true,
        maxResponseSizeBytes: 256 * 1024,
        preserveHttpRedirects: true,
        rateLimitMs: 2345,
        skipCanonicalUrl: true,
        skipChunks: true,
        skipCreatedEventsForRedirects: true,
        waitTimeoutMs: 1,
      },
    )

    const jobs = await readAllQueueJobs(crawlUrls)
    const job = jobs.find(j => (j.data as { url_id?: string }).url_id === 'url-2')
    expect(job).toBeDefined()
    expect(job!.opts).toMatchObject({
      priority: 0,
      removeOnComplete: { age: 60, count: 100 },
      ordering: { key: 'hostname-2', rateLimit: { max: 1, duration: 2345 } },
    })
    expect(job!.data).toMatchObject({
      crawl_timeout_ms: 10_000,
      ensure_crawler_for_redirects: true,
      ignore_robots_txt: true,
      max_response_size_bytes: 256 * 1024,
      preserve_http_redirects: true,
      skip_canonical_url: true,
      skip_chunks: true,
      skip_created_events_for_redirects: true,
      wait_for_result: true,
    })
    expect(job!.opts).not.toHaveProperty('deduplication')
    await expect(resultPromise).resolves.toBeNull()
  })

  it('returns the completed crawl result from the worker', async () => {
    const worker = createWorker(CRAWL_URLS_QUEUE_NAME, async () => ({
      url_id: 'url-3',
      crawl_id: 'crawl-3',
      response_status_code: 200,
    }))
    try {
      await expect(enqueueCrawlUrlAndWait({ urlId: 'url-3' })).resolves.toEqual({
        url_id: 'url-3',
        crawl_id: 'crawl-3',
        response_status_code: 200,
      })
    } finally {
      await worker.close()
    }
  })

  it('returns the completed crawl result from a replacement worker job', async () => {
    const worker = createWorker(CRAWL_URLS_QUEUE_NAME, async job => {
      if ((job.data as { url_id?: string }).url_id === 'url-6') {
        const replacement = await crawlUrls.add('crawl_url', { url_id: 'url-6-retry' }, {})
        return { replacement_job_id: replacement?.id }
      }

      return {
        url_id: 'url-6-retry',
        crawl_id: 'crawl-6',
        response_status_code: 200,
      }
    })
    try {
      await expect(enqueueCrawlUrlAndWait({ urlId: 'url-6' })).resolves.toEqual({
        url_id: 'url-6-retry',
        crawl_id: 'crawl-6',
        response_status_code: 200,
      })
    } finally {
      await worker.close()
    }
  })

  it('returns null when the completed worker result is empty', async () => {
    const worker = createWorker(CRAWL_URLS_QUEUE_NAME, async () => null)
    try {
      await expect(enqueueCrawlUrlAndWait({ urlId: 'url-4' })).resolves.toBeNull()
    } finally {
      await worker.close()
    }
  })

  it('returns null when the completed worker result is malformed', async () => {
    const worker = createWorker(CRAWL_URLS_QUEUE_NAME, async () => ({
      url_id: 'url-5',
      crawl_id: 'crawl-5',
    }))
    try {
      await expect(enqueueCrawlUrlAndWait({ urlId: 'url-5' })).resolves.toBeNull()
    } finally {
      await worker.close()
    }
  })
})
