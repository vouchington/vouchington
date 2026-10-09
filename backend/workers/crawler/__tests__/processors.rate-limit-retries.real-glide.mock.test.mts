import { randomUUID } from 'node:crypto'
import { Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { CrawlerRateLimitError } from '@modules/on-error/errors'
import { CRAWL_URLS_QUEUE_NAME } from '@queues/crawler/config'
import { enqueueCrawlUrlAndWait } from '@queues/crawler/enqueues'
import { crawlUrls } from '@queues/crawler/queues'
import { insertTestUrl, insertTestUrlHostname } from '@voucha/test-helpers'
import { handleCrawlerProcessorError } from '../processors/outcomes.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

// Replacements carry a delay, so they wait for a promotion tick; the default tick is 5 s per hop.
const PROMOTION_INTERVAL_MS = 100
const RETRY_AFTER_MS = 1

describe('crawler rate-limit replacements with real GlideMQ', () => {
  it('enqueues every replacement while the previous one is still active', async () => {
    const { urlId, url } = await createCrawlerUrlFixture('chain')
    const crawlResult = { url_id: urlId, crawl_id: randomUUID(), response_status_code: 200 }
    const retryCounts: number[] = []
    const worker = new Worker(
      CRAWL_URLS_QUEUE_NAME,
      async (job: Job) => {
        const retryCount = (job.data.rate_limit_retry_count as number | undefined) ?? 0
        retryCounts.push(retryCount)
        try {
          return await handleCrawlerProcessorError(
            urlId,
            retryCount,
            new CrawlerRateLimitError(url, 429, 10, RETRY_AFTER_MS),
            { waitForResult: true },
          )
        } catch (err) {
          // The circuit breaker tripped: the last replacement is allowed to finish the crawl.
          if (err instanceof CrawlerRateLimitError) return crawlResult
          throw err
        }
      },
      {
        connection: workerQueueConnection,
        prefix: workerQueuePrefix,
        concurrency: 1,
        blockTimeout: 1000,
        promotionInterval: PROMOTION_INTERVAL_MS,
      },
    )
    try {
      await worker.waitUntilReady()

      const result = await enqueueCrawlUrlAndWait({ urlId }, { waitTimeoutMs: 20_000 })

      expect(result).toEqual(crawlResult)
      expect(retryCounts).toEqual([0, 1, 2, 3])
      const jobs = await crawlUrls.searchJobs({ name: 'crawl_url', data: { url_id: urlId } })
      const dedupIds = jobs
        .flatMap(job => job.opts.deduplication?.id ?? [])
        .toSorted((a, b) => a.localeCompare(b))
      expect(dedupIds).toEqual([
        `crawl_url_ratelimit__${urlId}__1`,
        `crawl_url_ratelimit__${urlId}__2`,
        `crawl_url_ratelimit__${urlId}__3`,
      ])
    } finally {
      await worker.close(true)
      await crawlUrls.obliterate({ force: true })
      await crawlUrls.close()
    }
  })
})

async function createCrawlerUrlFixture(label: string) {
  // Rate-limit calculation fetches robots.txt. `*.localhost` is loopback, so that fetch
  // stays inside the test network allowlist and does not leave the machine.
  const hostname = `crawler-${label}-${randomUUID()}.localhost`
  const hostnameId = await insertTestUrlHostname({ hostname })
  const url = `https://${hostname}/path`
  const urlId = await insertTestUrl({ hostnameId, url })
  return { hostname, hostnameId, url, urlId }
}
