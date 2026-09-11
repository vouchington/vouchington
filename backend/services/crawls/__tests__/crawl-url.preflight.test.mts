import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCrawler } from '@services/crawlers'
import { addUrl } from '@services/urls/upsert'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { createTestUser } from '@voucha/test-helpers'
import type { CrawlerHtmlResult } from '@services/crawler-html/types'
import type { PrivateUser } from '@services/users/types'
import { crawlUrl } from '../crawl-url.mts'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from '../constants.mts'
import { createCrawl } from '../create.mts'
import { updateCrawl } from '../update.mts'

const fetchCrawlerHtml = vi.fn<VitestLooseMock>()
const isUrlCrawlable = vi.fn<VitestLooseMock>().mockResolvedValue(true)
const resolveSafeCrawlerAddresses = vi
  .fn<VitestLooseMock>()
  .mockResolvedValue([{ address: '93.184.216.34', family: 4 }])

let user: PrivateUser

const PRESERVED_EMBED: NonNullable<CrawlerHtmlResult['embedMetadata']> = {
  kind: 'player',
  requestedUrl: 'https://www.youtube.com/watch?v=preserved-video',
  resolvedUrl: 'https://www.youtube.com/watch?v=preserved-video',
  title: 'Preserved video',
  description: null,
  author: null,
  provider: { key: 'youtube', name: 'YouTube', url: null, resourceId: 'preserved-video' },
  thumbnail: null,
  player: null,
}

describe('crawl-url.preflight', () => {
  beforeAll(async () => {
    user = await createTestUser()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends conditional metadata when the previous snapshot is reusable', async () => {
    const lastModifiedAt = new Date('2026-07-01T00:00:00.000Z')
    const url = await seedPreviousCrawl({
      etag: 'fresh-etag',
      htmlSnapshotUploadedAt: new Date(),
      lastModifiedAt,
    })
    fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult())

    await crawlUrlForTest(url.id)

    expect(fetchCrawlerHtml).toHaveBeenCalledOnce()
    expect(fetchCrawlerHtml.mock.calls[0]![0]).toMatchObject({
      etag: 'fresh-etag',
      lastModifiedAt: lastModifiedAt.toISOString(),
    })
  })

  it('omits conditional metadata when the previous snapshot is stale', async () => {
    const url = await seedPreviousCrawl({
      etag: 'stale-etag',
      htmlSnapshotUploadedAt: new Date(
        Date.now() - (CRAWL_HTML_SNAPSHOT_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000,
      ),
      lastModifiedAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult())

    await crawlUrlForTest(url.id)

    expect(fetchCrawlerHtml).toHaveBeenCalledOnce()
    expect(fetchCrawlerHtml.mock.calls[0]![0]).toMatchObject({
      etag: undefined,
      lastModifiedAt: undefined,
    })
  })

  it('uses completed_at as the rollout fallback when the previous upload timestamp is null', async () => {
    const lastModifiedAt = new Date('2026-07-01T00:00:00.000Z')
    const url = await seedPreviousCrawl({
      etag: 'legacy-etag',
      htmlSnapshotUploadedAt: null,
      lastModifiedAt,
    })
    fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult())

    await crawlUrlForTest(url.id)

    expect(fetchCrawlerHtml).toHaveBeenCalledOnce()
    expect(fetchCrawlerHtml.mock.calls[0]![0]).toMatchObject({
      etag: 'legacy-etag',
      lastModifiedAt: lastModifiedAt.toISOString(),
    })
  })

  it('skips the robots.txt crawlability check when requested', async () => {
    const url = await seedPreviousCrawl({
      etag: 'robots-etag',
      htmlSnapshotUploadedAt: new Date(),
      lastModifiedAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult())

    await crawlUrlForTest(url.id, { ignoreRobotsTxt: true })

    expect(isUrlCrawlable).not.toHaveBeenCalled()
    expect(fetchCrawlerHtml).toHaveBeenCalledOnce()
  })

  it('stops before fetching HTML when robots.txt crawlability fails closed', async () => {
    const url = await seedPreviousCrawl({
      etag: 'robots-error-etag',
      htmlSnapshotUploadedAt: new Date(),
      lastModifiedAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    isUrlCrawlable.mockRejectedValueOnce(new Error('robots unavailable'))

    await expect(crawlUrlForTest(url.id)).resolves.toBeNull()
    expect(fetchCrawlerHtml).not.toHaveBeenCalled()
  })

  it('passes the max response size override to the HTML fetcher', async () => {
    const url = await seedPreviousCrawl({
      etag: 'max-size-etag',
      htmlSnapshotUploadedAt: new Date(),
      lastModifiedAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult())

    await crawlUrlForTest(url.id, { maxResponseSizeBytes: 256 * 1024 })

    expect(fetchCrawlerHtml.mock.calls[0]![0]).toMatchObject({
      maxResponseSizeBytes: 256 * 1024,
    })
  })

  it('passes the embed-resolution opt-out to the HTML fetcher', async () => {
    const url = await seedPreviousCrawl({
      etag: 'skip-embeds-etag',
      embedMetadata: PRESERVED_EMBED,
      htmlSnapshotUploadedAt: new Date(),
      lastModifiedAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult())

    const crawl = await crawlUrlForTest(url.id, { skipEmbedResolution: true })

    expect(fetchCrawlerHtml.mock.calls[0]![0]).toMatchObject({ skipEmbedResolution: true })
    expect(crawl?.embed_metadata).toBeNull()
  })

  it('does not replace prior embed metadata when optional resolution fails', async () => {
    const url = await seedPreviousCrawl({
      etag: 'failed-embeds-etag',
      embedMetadata: PRESERVED_EMBED,
      htmlSnapshotUploadedAt: new Date(),
      lastModifiedAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    fetchCrawlerHtml.mockResolvedValueOnce({
      ...createMockCrawlerResult(),
      embedResolutionStatus: 'failed',
    })

    const crawl = await crawlUrlForTest(url.id)

    expect(crawl?.embed_metadata).toBeNull()
  })

  it('does not replace prior embed metadata across a not-modified response', async () => {
    const url = await seedPreviousCrawl({
      etag: 'not-modified-embeds-etag',
      embedMetadata: PRESERVED_EMBED,
      htmlSnapshotUploadedAt: new Date(),
      lastModifiedAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    fetchCrawlerHtml.mockResolvedValueOnce({
      ...createMockCrawlerResult(),
      content: undefined,
      response_status_code: 304,
    })

    const crawl = await crawlUrlForTest(url.id)

    expect(crawl?.embed_metadata).toBeNull()
  })

  it('does not copy metadata across an intervening error snapshot', async () => {
    const url = await seedPreviousCrawl({
      etag: 'error-between-embeds-etag',
      embedMetadata: PRESERVED_EMBED,
      htmlSnapshotUploadedAt: new Date(),
      lastModifiedAt: new Date('2026-07-01T00:00:00.000Z'),
      laterSnapshotStatusCode: 404,
    })
    fetchCrawlerHtml.mockResolvedValueOnce(createMockCrawlerResult())

    const crawl = await crawlUrlForTest(url.id, { skipEmbedResolution: true })

    expect(crawl?.embed_metadata).toBeNull()
  })

  it('does not replace prior metadata when a successful response has no extractable HTML', async () => {
    const url = await seedPreviousCrawl({
      etag: 'no-html-embeds-etag',
      embedMetadata: PRESERVED_EMBED,
      htmlSnapshotUploadedAt: new Date(),
      lastModifiedAt: new Date('2026-07-01T00:00:00.000Z'),
    })
    fetchCrawlerHtml.mockResolvedValueOnce({
      ...createMockCrawlerResult(),
      content: undefined,
      response_status_code: 204,
    })

    const crawl = await crawlUrlForTest(url.id)

    expect(crawl?.embed_metadata).toBeNull()
  })
})

function crawlUrlForTest(
  urlId: string,
  options: {
    ignoreRobotsTxt?: boolean
    maxResponseSizeBytes?: number
    skipEmbedResolution?: boolean
  } = {},
) {
  return crawlUrl(urlId, 0, new Set(), {
    dependencies: {
      fetchCrawlerHtml,
      isUrlCrawlable,
      resolveSafeCrawlerAddresses,
    },
    ...options,
  })
}

function createMockCrawlerResult(): CrawlerHtmlResult {
  return {
    response_status_code: 200,
    request_headers: { 'User-Agent': 'test' },
    response_headers: {},
    crawl_started_at: new Date(),
    crawl_completed_at: new Date(),
    content: {
      title: 'Test',
      meta: {},
      links: {},
      content: 'Test content',
    },
  }
}

async function seedPreviousCrawl(options: {
  etag: string
  embedMetadata?: CrawlerHtmlResult['embedMetadata']
  htmlSnapshotUploadedAt: Date | null
  lastModifiedAt: Date
  laterSnapshotStatusCode?: number
}) {
  const random = Math.random().toString(36).slice(2, 15)
  const url = await addUrl(user.id, `https://snapshot-conditional-${random}.example.com/page`)
  const crawler = await createCrawler(user, {
    hostname_id: url!.hostname.id,
    crawler_type: 'fetch',
  })
  await updateUrlHostname(url!.hostname.id, { crawlable: true })
  const previousCrawl = await createCrawl(url!.id, crawler.id, {
    etag: options.etag,
    last_modified_at: options.lastModifiedAt,
  })
  await updateCrawl(previousCrawl.id, url!.id, {
    completed_at: options.laterSnapshotStatusCode ? new Date(Date.now() - 1_000) : new Date(),
    embed_metadata: options.embedMetadata,
    html_sha256: Buffer.alloc(32, 1),
    html_snapshot_uploaded_at: options.htmlSnapshotUploadedAt,
  })
  if (options.laterSnapshotStatusCode) {
    const laterCrawl = await createCrawl(url!.id, crawler.id)
    await updateCrawl(laterCrawl.id, url!.id, {
      completed_at: new Date(),
      html_sha256: Buffer.alloc(32, 2),
      html_snapshot_uploaded_at: new Date(),
      response_status_code: options.laterSnapshotStatusCode,
    })
  }
  return url!
}
