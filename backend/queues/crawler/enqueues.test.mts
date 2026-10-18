import { beforeEach, describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { enqueueBulkCrawlUrls } from './enqueues.mts'
import { backgroundCpu as crawlUrls } from '@queues/background-cpu/queues'

describe('enqueueBulkCrawlUrls', () => {
  beforeEach(async () => {
    await crawlUrls.obliterate({ force: true })
  })

  it('keeps bulk crawl jobs deduplicated by URL', async () => {
    await enqueueBulkCrawlUrls(
      [{ urlId: 'url-1', options: { importRowId: 'row-1', importDiscoveryGeneration: 'gen-1' } }],
      {
        hostnameId: 'hostname-1',
        rateLimitMs: 1234,
      },
    )

    const jobs = await readAllQueueJobs(crawlUrls)
    const job = jobs.find(j => (j.data as { url_id?: string }).url_id === 'url-1')
    expect(job).toBeDefined()
    expect(job!.opts).toMatchObject({
      priority: 10,
      deduplication: { id: 'crawl.crawl_url__url-1__row-1__gen-1', mode: 'debounce', ttl: 1234 },
      ordering: { key: 'crawl:hostname-1', concurrency: 1, rateLimit: { max: 1, duration: 1234 } },
    })
    expect(job!.data).toMatchObject({
      import_row_id: 'row-1',
      import_discovery_generation: 'gen-1',
    })
  })

  it('gives each rate-limit replacement its own dedup id per retry count', async () => {
    await enqueueBulkCrawlUrls([
      { urlId: 'url-ratelimit', rateLimitRetryCount: 1 },
      { urlId: 'url-ratelimit', rateLimitRetryCount: 2 },
    ])

    const jobs = await readAllQueueJobs(crawlUrls)
    const dedupIds = jobs
      .filter(j => (j.data as { url_id?: string }).url_id === 'url-ratelimit')
      .map(j => (j.opts as { deduplication?: { id?: string } }).deduplication?.id)
      .toSorted()
    expect(dedupIds).toEqual([
      'crawl.crawl_url_ratelimit__url-ratelimit__1',
      'crawl.crawl_url_ratelimit__url-ratelimit__2',
    ])
  })
})
