import { it, expect, beforeAll, describe } from 'vitest'
import { getCrawlById, getLatestHtmlSnapshotCrawl, getLatestSuccessfulCrawl } from './get.mts'
import {
  getLatestSuccessfulPublicUrlCrawlSummary,
  getPublicUrlCrawlDetailById,
} from './get-paid-safe-url-crawl.mts'
import { getLatestHtmlSnapshotCrawlBefore } from './get-latest-html-snapshot-before.mts'
import { createCrawl } from './create.mts'
import { updateCrawl } from './update.mts'
import { addUrl } from '@services/urls/upsert'
import { createCrawler } from '@services/crawlers'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('get.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('getCrawlById returns null when crawl does not exist', async () => {
    const url = await addUrl(null, 'https://example.com/test-get')
    const fakeUuid = '00000000-0000-0000-0000-000000000000'
    const crawl = await getCrawlById(fakeUuid, url!.id)
    expect(crawl).toBeNull()
  })

  it('getCrawlById returns crawl by ID and URL ID', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/test-get-crawl-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const retrieved = await getCrawlById(crawl.id, url!.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(crawl.id)
    expect(retrieved!.url_id).toBe(url!.id)
    expect(retrieved!.crawler_id).toBe(crawler.id)
  })

  it('getLatestSuccessfulCrawl returns null when no successful crawl exists', async () => {
    const url = await addUrl(null, 'https://example.com/test-latest')
    const crawl = await getLatestSuccessfulCrawl(url!.id)
    expect(crawl).toBeNull()
  })

  it('getLatestSuccessfulCrawl returns crawl with embeddings', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/test-latest-success-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    await updateCrawl(crawl.id, url!.id, {
      embeddings_generated_at: new Date(),
      markdown: 'Test content',
      title: 'Test',
      links: {},
      meta_tags: {},
    })

    const retrieved = await getLatestSuccessfulCrawl(url!.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.embeddings_generated_at).toBeDefined()
  })

  it('getPublicUrlCrawlDetailById does not materialize privileged crawl fields', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/test-public-detail-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    await updateCrawl(crawl.id, url!.id, {
      request_headers: { authorization: 'private-request-header' },
      response_headers: { 'set-cookie': 'private-response-header' },
      html_sha256: Buffer.alloc(32, 1),
      html_snapshot_uploaded_at: new Date(),
      markdown: 'Public crawl body',
      links: { a: ['/public-link'] },
      meta_tags: { 'og:image': 'https://example.com/public-image.png' },
    })

    const retrieved = await getPublicUrlCrawlDetailById(crawl.id, url!.id)

    expect(retrieved).toMatchObject({ id: crawl.id })
    expect(retrieved).not.toHaveProperty('request_headers')
    expect(retrieved).not.toHaveProperty('response_headers')
    expect(retrieved).not.toHaveProperty('html_sha256')
    expect(retrieved).not.toHaveProperty('html_snapshot_uploaded_at')
    expect(retrieved).not.toHaveProperty('markdown')
    expect(retrieved).not.toHaveProperty('links')
    expect(retrieved).not.toHaveProperty('meta_tags')
  })

  it('getLatestSuccessfulPublicUrlCrawlSummary does not materialize crawl body fields', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/test-public-summary-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    await updateCrawl(crawl.id, url!.id, {
      embeddings_generated_at: new Date(),
      request_headers: { authorization: 'private-request-header' },
      response_headers: { 'set-cookie': 'private-response-header' },
      html_sha256: Buffer.alloc(32, 1),
      html_snapshot_uploaded_at: new Date(),
      markdown: 'Private crawl body',
      links: { a: ['/private-link'] },
      meta_tags: { 'og:image': 'https://example.com/private-image.png' },
    })

    const retrieved = await getLatestSuccessfulPublicUrlCrawlSummary(url!.id)

    expect(retrieved).toMatchObject({ id: crawl.id })
    expect(retrieved).not.toHaveProperty('request_headers')
    expect(retrieved).not.toHaveProperty('response_headers')
    expect(retrieved).not.toHaveProperty('html_sha256')
    expect(retrieved).not.toHaveProperty('html_snapshot_uploaded_at')
    expect(retrieved).not.toHaveProperty('markdown')
    expect(retrieved).not.toHaveProperty('links')
    expect(retrieved).not.toHaveProperty('meta_tags')
  })

  it('getLatestHtmlSnapshotCrawl returns latest completed crawl with an uploaded snapshot', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/test-latest-snapshot-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    await updateCrawl(crawl.id, url!.id, {
      completed_at: new Date(),
      html_sha256: Buffer.alloc(32, 1),
      html_snapshot_uploaded_at: new Date(),
    })

    const retrieved = await getLatestHtmlSnapshotCrawl(url!.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(crawl.id)
    expect(retrieved!.embeddings_generated_at).toBeNull()
  })

  it('getLatestHtmlSnapshotCrawlBefore returns the previous 2xx snapshot metadata', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/test-previous-snapshot-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const previous = await createCrawl(url!.id, crawler.id)
    await updateCrawl(previous.id, url!.id, {
      completed_at: new Date('2026-01-01T00:00:00.000Z'),
      html_sha256: Buffer.alloc(32, 1),
      html_snapshot_uploaded_at: new Date('2026-01-01T00:00:00.000Z'),
      response_status_code: 200,
      embed_metadata: {
        kind: 'article',
        requestedUrl: url!.url,
        resolvedUrl: url!.url,
        title: 'Previous embed',
        description: null,
        author: null,
        provider: null,
        thumbnail: null,
        player: null,
      },
      links: { alternate: { 'application/rss+xml': ['/feed.xml'] } },
    })
    const emptyLinks = await createCrawl(url!.id, crawler.id)
    await updateCrawl(emptyLinks.id, url!.id, {
      completed_at: new Date('2026-01-02T00:00:00.000Z'),
      html_sha256: Buffer.alloc(32, 2),
      html_snapshot_uploaded_at: new Date('2026-01-02T00:00:00.000Z'),
      response_status_code: 304,
      links: {},
    })
    const errorSnapshot = await createCrawl(url!.id, crawler.id)
    await updateCrawl(errorSnapshot.id, url!.id, {
      completed_at: new Date('2026-01-03T00:00:00.000Z'),
      html_sha256: Buffer.alloc(32, 3),
      html_snapshot_uploaded_at: new Date('2026-01-03T00:00:00.000Z'),
      response_status_code: 404,
      links: { alternate: { 'application/rss+xml': ['/error-feed.xml'] } },
    })
    const current = await createCrawl(url!.id, crawler.id)
    await updateCrawl(current.id, url!.id, {
      completed_at: new Date('2026-01-04T00:00:00.000Z'),
      html_sha256: Buffer.alloc(32, 4),
      html_snapshot_uploaded_at: new Date('2026-01-04T00:00:00.000Z'),
      response_status_code: 304,
      links: {},
    })
    const laterSnapshot = await createCrawl(url!.id, crawler.id)
    await updateCrawl(laterSnapshot.id, url!.id, {
      completed_at: new Date('2026-01-05T00:00:00.000Z'),
      html_sha256: Buffer.alloc(32, 5),
      html_snapshot_uploaded_at: new Date('2026-01-05T00:00:00.000Z'),
      response_status_code: 200,
      links: { alternate: { 'application/rss+xml': ['/later-feed.xml'] } },
    })

    const retrieved = await getLatestHtmlSnapshotCrawlBefore(url!.id, current.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.id).toBe(previous.id)
    expect(retrieved!.links).toEqual({
      alternate: { 'application/rss+xml': ['/feed.xml'] },
    })
    expect(retrieved!.embed_metadata?.title).toBe('Previous embed')
  })

  it('getLatestHtmlSnapshotCrawlBefore rejects invalid IDs', async () => {
    await expect(
      getLatestHtmlSnapshotCrawlBefore('not-a-url-id', 'not-a-crawl-id'),
    ).rejects.toThrow('Invalid URL ID or crawl ID')
  })
})
