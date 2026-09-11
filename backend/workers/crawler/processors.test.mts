import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import { randomUUID } from 'node:crypto'
import { insertTestUrl, insertTestUrlHostname, readAllQueueJobs } from '@voucha/test-helpers'
import { CrawlerNetworkError, CrawlerRateLimitError } from '@modules/on-error/errors'
import { crawlUrls } from '@queues/crawler/queues'
import { setDomainRateLimited } from '@services/crawls/domain-rate-limit'
import {
  buildCrawlerJobResult,
  handleCrawlerProcessorError,
  processCrawlerJob,
} from './processors.mts'
import type { CrawlBasic } from '@services/crawls/types'

describe('crawler processor', () => {
  beforeEach(async () => {
    await crawlUrls.obliterate({ force: true })
  })

  afterEach(async () => {
    await crawlUrls.obliterate({ force: true })
  })

  it('returns null when crawl_url skips a local hostname before fetching', async () => {
    const hostname = `crawler-${randomUUID()}.local`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlId = await insertTestUrl({ hostnameId, url: `http://${hostname}/path` })

    await expect(processCrawlerJob(makeJob('crawl_url', { url_id: urlId }))).resolves.toBeNull()
  })

  it('accepts a crawl timeout override on crawl_url jobs', async () => {
    const hostname = `crawler-timeout-${randomUUID()}.local`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const urlId = await insertTestUrl({ hostnameId, url: `http://${hostname}/path` })

    await expect(
      processCrawlerJob(makeJob('crawl_url', { url_id: urlId, crawl_timeout_ms: 10_000 })),
    ).resolves.toBeNull()
  })

  it('rejects malformed and unknown crawler jobs', async () => {
    await expect(processCrawlerJob(makeJob('crawl_url', {}))).rejects.toThrow(
      'Crawl URL job .url_id is required',
    )
    await expect(processCrawlerJob(makeJob('unexpected', {}))).rejects.toThrow(
      'Crawler job unexpected not found',
    )
  })

  it('routes rate-limit preflight errors through the processor error handler', async () => {
    const { hostnameId, urlId } = await createCrawlerUrlFixture('process-rate-limit')
    await setDomainRateLimited(hostnameId, 1_000)

    await expect(
      processCrawlerJob(makeJob('crawl_url', { url_id: urlId }, { priority: 7 })),
    ).resolves.toEqual({
      replacement_job_id: expect.any(String),
    })

    const waiting = await readAllQueueJobs(crawlUrls)
    expect(
      waiting.some(
        job =>
          job.name === 'crawl_url' &&
          (job.data as { url_id?: string; rate_limit_retry_count?: number }).url_id === urlId &&
          (job.data as { url_id?: string; rate_limit_retry_count?: number })
            .rate_limit_retry_count === 1 &&
          job.opts.priority === 7,
      ),
    ).toBe(true)
  })

  it('builds the worker result from a successful crawl', () => {
    expect(
      buildCrawlerJobResult({
        __entity_type: 'crawl',
        id: 'crawl-1',
        url_id: 'url-1',
        created_at: new Date(),
        crawler_id: 'crawler-1',
        last_modified_at: null,
        etag: null,
        html_sha256: null,
        html_snapshot_uploaded_at: null,
        request_headers: {},
        response_headers: {},
        response_status_code: 204,
        redirect_url_id: null,
        network_error: null,
        completed_at: new Date(),
        has_pending_embeddings: false,
        embeddings_generated_at: null,
        markdown: '',
        title: null,
        links: {},
        meta_tags: {},
        embed_metadata: null,
        embed_oembed_url: null,
        embed_oembed_resolved_at: null,
        lang: null,
      } satisfies CrawlBasic),
    ).toEqual({
      url_id: 'url-1',
      crawl_id: 'crawl-1',
      response_status_code: 204,
    })
  })

  it('re-enqueues rate-limited URLs until the processor circuit breaker trips', async () => {
    const { urlId, url } = await createCrawlerUrlFixture('rate-limit')

    await expect(
      handleCrawlerProcessorError(urlId, 0, new CrawlerRateLimitError(url, 429, 10, 0)),
    ).resolves.toEqual({ replacement_job_id: expect.any(String) })

    const waiting = await readAllQueueJobs(crawlUrls)
    expect(
      waiting.some(
        job =>
          job.name === 'crawl_url' &&
          (job.data as { url_id?: string; rate_limit_retry_count?: number }).url_id === urlId &&
          (job.data as { url_id?: string; rate_limit_retry_count?: number })
            .rate_limit_retry_count === 1,
      ),
    ).toBe(true)

    await expect(
      handleCrawlerProcessorError(urlId, 3, new CrawlerRateLimitError(url, 429, 10, 0)),
    ).rejects.toThrow(CrawlerRateLimitError)
  })

  it('preserves discovery crawl options on rate-limit replacement jobs', async () => {
    const { urlId, url } = await createCrawlerUrlFixture('rate-limit-options')

    await handleCrawlerProcessorError(urlId, 0, new CrawlerRateLimitError(url, 429, 10, 0), {
      crawlTimeoutMs: 10_000,
      ensureCrawlerForRedirects: true,
      ignoreRobotsTxt: true,
      maxResponseSizeBytes: 256 * 1024,
      preserveHttpRedirects: true,
      priority: 0,
      skipCanonicalUrl: true,
      skipChunks: true,
      skipCreatedEventsForRedirects: true,
      waitForResult: true,
    })

    const waiting = await readAllQueueJobs(crawlUrls)
    expect(
      waiting.some(
        job =>
          job.name === 'crawl_url' &&
          job.opts.priority === 0 &&
          (
            job.data as {
              crawl_timeout_ms?: number
              ensure_crawler_for_redirects?: boolean
              ignore_robots_txt?: boolean
              max_response_size_bytes?: number
              preserve_http_redirects?: boolean
              skip_canonical_url?: boolean
              skip_chunks?: boolean
              skip_created_events_for_redirects?: boolean
              wait_for_result?: boolean
            }
          ).crawl_timeout_ms === 10_000 &&
          (job.data as { ensure_crawler_for_redirects?: boolean }).ensure_crawler_for_redirects ===
            true &&
          (job.data as { ignore_robots_txt?: boolean }).ignore_robots_txt === true &&
          (job.data as { max_response_size_bytes?: number }).max_response_size_bytes ===
            256 * 1024 &&
          (job.data as { preserve_http_redirects?: boolean }).preserve_http_redirects === true &&
          (job.data as { skip_canonical_url?: boolean }).skip_canonical_url === true &&
          (job.data as { skip_chunks?: boolean }).skip_chunks === true &&
          (job.data as { skip_created_events_for_redirects?: boolean })
            .skip_created_events_for_redirects === true &&
          (job.data as { wait_for_result?: boolean }).wait_for_result === true &&
          JSON.stringify(job.opts.removeOnComplete) === JSON.stringify({ age: 60, count: 100 }),
      ),
    ).toBe(true)
  })

  it('enqueues same-host retry candidates for transient crawl failures', async () => {
    const { hostnameId, urlId, url } = await createCrawlerUrlFixture('retry-candidates')
    const candidateA = await insertTestUrl({ hostnameId, url: `${url}/a` })
    const candidateB = await insertTestUrl({ hostnameId, url: `${url}/b` })

    await expect(
      handleCrawlerProcessorError(
        urlId,
        0,
        new CrawlerNetworkError(url, 10, new Error('ECONNRESET')),
      ),
    ).rejects.toThrow(CrawlerNetworkError)

    const waiting = await readAllQueueJobs(crawlUrls)
    const queuedIds = waiting.map(job => (job.data as { url_id?: string }).url_id)
    expect(queuedIds).toContain(candidateA)
    expect(queuedIds).toContain(candidateB)
  })
})

function makeJob(
  name: string,
  data: Record<string, unknown>,
  opts: Partial<Job['opts']> = {},
): Job<Record<string, unknown>> {
  return { data, name, opts } as Job<Record<string, unknown>>
}

async function createCrawlerUrlFixture(label: string) {
  const hostname = `crawler-${label}-${randomUUID()}.example.com`
  const hostnameId = await insertTestUrlHostname({ hostname })
  const url = `https://${hostname}/path`
  const urlId = await insertTestUrl({ hostnameId, url })
  return { hostname, hostnameId, url, urlId }
}
