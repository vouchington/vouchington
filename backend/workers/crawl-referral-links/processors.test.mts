import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import {
  createReferralProgramFixture,
  createTestReferralProgramLink,
  createTestUser,
} from '@voucha/test-helpers'
import {
  getReferralLinkCrawlStatus,
  getReferralLinkLastCrawlId,
} from '@voucha/test-helpers/entities/referral-links'
import { updateUrlHostnameCrawlable } from '@voucha/test-helpers/entities/url-hostnames'
import { addUrl } from '@services/urls/upsert'
import { createCrawler } from '@services/crawlers'
import { crawlBrowserQueue } from '@queues/crawl-browser/queues'
import {
  CrawlerHttpClientError,
  CrawlerNetworkError,
  CrawlerRateLimitError,
} from '@modules/on-error/errors'
import {
  handleCrawlReferralLinkError,
  handleCrawlReferralLinkResult,
  processCrawlReferralLinksJob,
} from './processors.mts'
import { setDomainRateLimited } from '@services/crawls/domain-rate-limit'
import { createCrawl } from '@services/crawls/create'
import type { CrawlBasic } from '@services/crawls/types'
import { suppressedError } from '@voucha/test-helpers/suppressed-error'

describe('crawl referral links processor', () => {
  it('enqueues crawl_browser for referral links with automation crawlers', async () => {
    const user = await createTestUser()
    expect(user).toBeTruthy()
    const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
    const hostname = `crawl-referral-${suffix}.example.com`
    const fixture = await createReferralProgramFixture({
      createdById: user!.id,
      randomSuffix: suffix,
      hostname,
    })
    const url = await addUrl(user!.id, `https://${hostname}/ref/${suffix}`)
    if (!url) throw new Error('Failed to create referral URL')
    const crawler = await createCrawler(null, {
      hostname_id: url.hostname.id,
      referral_program_id: fixture.referralProgramId,
      crawler_type: 'automation',
      priority: 10,
    })
    const linkId = await createTestReferralProgramLink({
      userId: user!.id,
      referralProgramId: fixture.referralProgramId,
      url: url.url,
      label: 'Integration referral link',
    })

    await processCrawlReferralLinksJob(
      makeJob('crawl_referral_link', {
        linkId,
        urlId: url.id,
        referralProgramId: fixture.referralProgramId,
      }),
    )

    const waiting = await crawlBrowserQueue.getJobs('waiting')
    expect(
      waiting.some(
        job =>
          job.name === 'crawl_browser' &&
          (job.data as { linkId?: string; urlId?: string; crawlerId?: string }).linkId === linkId &&
          (job.data as { linkId?: string; urlId?: string; crawlerId?: string }).urlId === url.id &&
          (job.data as { linkId?: string; urlId?: string; crawlerId?: string }).crawlerId ===
            crawler.id,
      ),
    ).toBe(true)
  })

  it('rejects malformed referral-link jobs', async () => {
    await expect(processCrawlReferralLinksJob(makeJob('crawl_referral_link', {}))).rejects.toThrow(
      'Crawl referral link job .linkId is required',
    )
    await expect(
      processCrawlReferralLinksJob(makeJob('crawl_referral_link', { linkId: randomUUID() })),
    ).rejects.toThrow('Crawl referral link job .urlId is required')
    await expect(
      processCrawlReferralLinksJob(
        makeJob('crawl_referral_link', { linkId: randomUUID(), urlId: randomUUID() }),
      ),
    ).rejects.toThrow('Crawl referral link job .referralProgramId is required')
    await expect(processCrawlReferralLinksJob(makeJob('unexpected', {}))).rejects.toThrow(
      'Crawl referral link job unexpected not found',
    )
    await expect(
      processCrawlReferralLinksJob({
        name: 'unexpected',
        data: {},
        opts: { ordering: { key: 'dispatcher' } },
      } as Job),
    ).rejects.toThrow('Crawl referral links dispatcher job unexpected not found')
  })

  it('updates referral-link crawl state for handled crawl errors', async () => {
    const { linkId, url } = await createReferralLinkFixture('errors')

    await handleCrawlReferralLinkError(linkId, new CrawlerHttpClientError(url.url, 404, 10))
    const gone = await getReferralLinkCrawlStatus(linkId)
    expect(gone.activated_at).toBeNull()
    expect(gone.deactivated_at).toBeTruthy()

    const healthFailure = await createReferralLinkFixture('health')
    await handleCrawlReferralLinkError(
      healthFailure.linkId,
      new CrawlerNetworkError(healthFailure.url.url, 10, new Error('ECONNRESET')),
    )
    const failed = await getReferralLinkCrawlStatus(healthFailure.linkId)
    expect(failed.consecutive_crawl_failures).toBe(1)
    expect(failed.last_crawl_failure_at).toBeTruthy()

    await expect(
      handleCrawlReferralLinkError(
        healthFailure.linkId,
        new CrawlerRateLimitError(healthFailure.url.url, 429, 10, 1_000),
      ),
    ).rejects.toThrow(CrawlerRateLimitError)
    await expect(
      handleCrawlReferralLinkError(healthFailure.linkId, suppressedError('unexpected')),
    ).rejects.toThrow('unexpected')
  })

  it('runs fetch crawler jobs through skip and rate-limit paths', async () => {
    const skipped = await createReferralLinkFixture('skip')
    await updateUrlHostnameCrawlable(skipped.url.hostname.id, false)
    await expect(
      processCrawlReferralLinksJob(
        makeJob('crawl_referral_link', {
          linkId: skipped.linkId,
          urlId: skipped.url.id,
          referralProgramId: skipped.fixture.referralProgramId,
        }),
      ),
    ).resolves.toBeUndefined()

    const limited = await createReferralLinkFixture('ratelimit')
    await setDomainRateLimited(limited.url.hostname.id, 1_000)
    await expect(
      processCrawlReferralLinksJob(
        makeJob('crawl_referral_link', {
          linkId: limited.linkId,
          urlId: limited.url.id,
          referralProgramId: limited.fixture.referralProgramId,
        }),
      ),
    ).rejects.toThrow(CrawlerRateLimitError)
  })

  it('handles successful and CSR-empty-shell crawl results', async () => {
    const success = await createReferralLinkFixture('success')
    const crawler = await createCrawler(null, {
      hostname_id: success.url.hostname.id,
      referral_program_id: success.fixture.referralProgramId,
      crawler_type: 'fetch',
      priority: 10,
    })
    const crawl = await createCrawl(success.url.id, crawler.id, {})

    await handleCrawlReferralLinkResult(
      success.linkId,
      success.url.id,
      crawler.id,
      makeCrawlBasic({
        id: crawl.id,
        urlId: success.url.id,
        crawlerId: crawler.id,
        markdown: 'This page has enough crawl content to avoid CSR fallback.',
        title: 'Referral page',
      }),
    )
    const updated = await getReferralLinkCrawlStatus(success.linkId)
    expect(updated.last_crawl_success_at).toBeTruthy()
    await expect(getReferralLinkLastCrawlId(success.linkId)).resolves.toBe(crawl.id)

    const csr = await createReferralLinkFixture('csr')
    const csrCrawler = await createCrawler(null, {
      hostname_id: csr.url.hostname.id,
      referral_program_id: csr.fixture.referralProgramId,
      crawler_type: 'fetch',
      priority: 10,
    })
    await handleCrawlReferralLinkResult(
      csr.linkId,
      csr.url.id,
      csrCrawler.id,
      makeCrawlBasic({
        id: randomUUID(),
        urlId: csr.url.id,
        crawlerId: csrCrawler.id,
        markdown: '',
        title: 'CSR shell',
      }),
    )

    const waiting = await crawlBrowserQueue.getJobs('waiting')
    expect(
      waiting.some(
        job =>
          job.name === 'crawl_browser' &&
          (job.data as { linkId?: string; urlId?: string; crawlerId?: string }).linkId ===
            csr.linkId &&
          (job.data as { linkId?: string; urlId?: string; crawlerId?: string }).urlId ===
            csr.url.id &&
          (job.data as { linkId?: string; urlId?: string; crawlerId?: string }).crawlerId ===
            csrCrawler.id,
      ),
    ).toBe(true)
  })
})

function makeJob(name: string, data: Record<string, string>): Job<Record<string, string>> {
  return { data, name, opts: {} } as Job<Record<string, string>>
}

async function createReferralLinkFixture(label: string, options: { hostname?: string } = {}) {
  const user = await createTestUser()
  if (!user) throw new Error('Failed to create test user')
  const suffix = `${label.replaceAll('-', '')}${randomUUID().replaceAll('-', '').slice(0, 16)}`
  const hostname = options.hostname ?? `crawl-referral-${suffix}.example.com`
  const fixture = await createReferralProgramFixture({
    createdById: user.id,
    randomSuffix: suffix,
    hostname,
  })
  const url = await addUrl(user.id, `https://${hostname}/ref/${suffix}`)
  if (!url) throw new Error('Failed to create referral URL')
  const linkId = await createTestReferralProgramLink({
    userId: user.id,
    referralProgramId: fixture.referralProgramId,
    url: url.url,
    label: 'Integration referral link',
  })
  return { fixture, linkId, url, user }
}

function makeCrawlBasic(data: {
  id: string
  urlId: string
  crawlerId: string
  markdown: string
  title: string | null
}): CrawlBasic {
  return {
    __entity_type: 'crawl',
    id: data.id,
    url_id: data.urlId,
    created_at: new Date(),
    crawler_id: data.crawlerId,
    last_modified_at: null,
    etag: null,
    html_sha256: null,
    html_snapshot_uploaded_at: null,
    request_headers: {},
    response_headers: {},
    response_status_code: 200,
    redirect_url_id: null,
    network_error: null,
    completed_at: new Date(),
    has_pending_embeddings: false,
    embeddings_generated_at: null,
    markdown: data.markdown,
    title: data.title,
    links: {},
    meta_tags: {},
    embed_metadata: null,
    embed_oembed_url: null,
    embed_oembed_resolved_at: null,
    lang: null,
  }
}
