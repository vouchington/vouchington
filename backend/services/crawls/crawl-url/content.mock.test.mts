import { describe, expect, it, vi, beforeAll } from 'vitest'
import { fileURLToPath } from 'node:url'
import { addUrl } from '@services/urls/upsert'
import { getUrlById } from '@services/urls/get'
import { createCrawler } from '@services/crawlers'
import { getUrlHostnameCrawlerDetailsById } from '@services/urls-hostnames'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createCrawl } from '../create.mts'
import { getCrawlById } from '../get.mts'
import type { CrawlHtmlFetchResult } from './types.mts'
import { CRAWL_HTML_SNAPSHOT_RETENTION_DAYS } from '../constants.mts'

vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => {
  const mockSend = vi.fn<VitestLooseMock>().mockResolvedValue({})
  return {
    ...(await importOriginal<typeof import('@modules/aws')>()),
    S3ImagesClient: {
      send: mockSend,
    } as unknown as typeof import('@modules/aws').S3ImagesClient,
  }
})

import { S3ImagesClient } from '@modules/aws'
import { persistCrawlContent } from './content.mts'

const mockSend = vi.mocked(S3ImagesClient.send)

function makeHtmlResult(
  _htmlBuffer: Buffer,
  embedMetadata?: CrawlHtmlFetchResult['embedMetadata'],
  embedOEmbedUrl?: CrawlHtmlFetchResult['embedOEmbedUrl'],
): CrawlHtmlFetchResult {
  return {
    request_headers: { 'User-Agent': 'test' },
    response_headers: {},
    response_status_code: 200,
    crawl_started_at: new Date(),
    crawl_completed_at: new Date(),
    content: { title: 'Test', meta: {}, links: {}, content: 'Test content' },
    embedMetadata,
    embedOEmbedUrl,
    htmlFile: {
      byteLength: 0,
      cleanup: async () => {},
      filePath: fileURLToPath(import.meta.url),
    },
  }
}

function makeNotModifiedResult(): CrawlHtmlFetchResult {
  return {
    request_headers: { 'User-Agent': 'test' },
    response_headers: {},
    response_status_code: 304,
    crawl_started_at: new Date(),
    crawl_completed_at: new Date(),
    content: undefined,
    htmlFile: undefined,
  }
}

describe('persistCrawlContent — S3 HTML snapshots', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('stores crawl-local metadata and preserves it when later enrichment is skipped', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://content-dedupe-${random}.example.com/page`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const hostname = (await getUrlHostnameCrawlerDetailsById(url!.hostname.id))!
    const urlRecord = (await getUrlById(url!.id))!

    mockSend.mockClear()
    mockSend.mockResolvedValueOnce({} as never)
    const embedMetadata: NonNullable<CrawlHtmlFetchResult['embedMetadata']> = {
      kind: 'player',
      requestedUrl: urlRecord.url,
      resolvedUrl: urlRecord.url,
      title: 'Embedded video',
      description: null,
      author: null,
      provider: { key: 'youtube', name: 'YouTube', url: null, resourceId: 'video-123' },
      thumbnail: null,
      player: {
        url: 'https://www.youtube-nocookie.com/embed/video-123',
        width: 640,
        height: 360,
      },
    }
    const updated = await persistCrawlContent({
      crawlId: crawl.id,
      hostname,
      htmlResult: makeHtmlResult(
        Buffer.from('<html>first</html>'),
        embedMetadata,
        'https://www.youtube.com/oembed?url=video-123',
      ),
      previousHtmlSha256: null,
      previousHtmlSnapshotUploadedAt: null,
      url: urlRecord,
    })

    expect(updated.html_sha256).not.toBeNull()
    expect(updated.html_snapshot_uploaded_at).not.toBeNull()
    expect(mockSend).toHaveBeenCalledOnce()
    const command = mockSend.mock.calls[0]![0] as unknown as { input: Record<string, unknown> }
    expect(command.input.Key).toBe(
      `${hostname.hostname}/${url!.id}/${updated.html_sha256!.toString('hex')}`,
    )

    const stored = await getCrawlById(crawl.id, url!.id)
    expect(stored!.html_sha256).toEqual(updated.html_sha256)
    expect(stored!.html_snapshot_uploaded_at).toEqual(updated.html_snapshot_uploaded_at)
    expect(stored!.embed_metadata).toEqual(embedMetadata)
    expect(stored!.embed_oembed_url).toBe('https://www.youtube.com/oembed?url=video-123')
    expect(stored!.embed_oembed_resolved_at).toBeNull()

    const skippedCrawl = await createCrawl(url!.id, crawler.id)
    const skippedUpdate = await persistCrawlContent({
      crawlId: skippedCrawl.id,
      hostname,
      htmlResult: makeHtmlResult(Buffer.from('<html>second</html>')),
      options: { skipEmbedResolution: true },
      previousHtmlSha256: updated.html_sha256,
      previousHtmlSnapshotUploadedAt: updated.html_snapshot_uploaded_at,
      url: urlRecord,
    })
    expect(skippedUpdate.embed_metadata).toBeNull()
  })

  it('skips uploading unchanged raw HTML when the previous snapshot is fresh', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(
      user!.id,
      `https://content-dedupe-unchanged-${random}.example.com/page`,
    )
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const hostname = (await getUrlHostnameCrawlerDetailsById(url!.hostname.id))!
    const urlRecord = (await getUrlById(url!.id))!
    const html = Buffer.from('<html>unchanged</html>')

    mockSend.mockClear()
    mockSend.mockResolvedValueOnce({} as never)
    const firstCrawl = await createCrawl(url!.id, crawler.id)
    const firstUpdate = await persistCrawlContent({
      crawlId: firstCrawl.id,
      hostname,
      htmlResult: makeHtmlResult(html),
      previousHtmlSha256: null,
      previousHtmlSnapshotUploadedAt: null,
      url: urlRecord,
    })

    mockSend.mockClear()
    const secondCrawl = await createCrawl(url!.id, crawler.id)
    const secondUpdate = await persistCrawlContent({
      crawlId: secondCrawl.id,
      hostname,
      htmlResult: makeHtmlResult(html),
      previousHtmlSha256: firstUpdate.html_sha256,
      previousHtmlSnapshotUploadedAt: firstUpdate.html_snapshot_uploaded_at,
      url: urlRecord,
    })

    expect(mockSend).not.toHaveBeenCalled()
    expect(secondUpdate.html_sha256).toEqual(firstUpdate.html_sha256)
    expect(secondUpdate.html_snapshot_uploaded_at).toEqual(firstUpdate.html_snapshot_uploaded_at)
  })

  it('re-uploads unchanged raw HTML when the previous snapshot is stale', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://content-dedupe-stale-${random}.example.com/page`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const hostname = (await getUrlHostnameCrawlerDetailsById(url!.hostname.id))!
    const urlRecord = (await getUrlById(url!.id))!
    const html = Buffer.from('<html>stale</html>')

    mockSend.mockClear()
    mockSend.mockResolvedValue({} as never)
    const firstCrawl = await createCrawl(url!.id, crawler.id)
    const firstUpdate = await persistCrawlContent({
      crawlId: firstCrawl.id,
      hostname,
      htmlResult: makeHtmlResult(html),
      previousHtmlSha256: null,
      previousHtmlSnapshotUploadedAt: null,
      url: urlRecord,
    })

    const staleUploadedAt = new Date(
      Date.now() - (CRAWL_HTML_SNAPSHOT_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000,
    )
    mockSend.mockClear()
    const secondCrawl = await createCrawl(url!.id, crawler.id)
    const secondUpdate = await persistCrawlContent({
      crawlId: secondCrawl.id,
      hostname,
      htmlResult: makeHtmlResult(html),
      previousHtmlSha256: firstUpdate.html_sha256,
      previousHtmlSnapshotUploadedAt: staleUploadedAt,
      url: urlRecord,
    })

    expect(mockSend).toHaveBeenCalledOnce()
    expect(secondUpdate.html_sha256).toEqual(firstUpdate.html_sha256)
    expect(secondUpdate.html_snapshot_uploaded_at).not.toEqual(staleUploadedAt)
    expect(secondUpdate.html_snapshot_uploaded_at!.getTime()).toBeGreaterThan(
      staleUploadedAt.getTime(),
    )
  })

  it('carries forward the previous html_sha256 on a 304 response', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://content-dedupe-304-${random}.example.com/page`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const hostname = (await getUrlHostnameCrawlerDetailsById(url!.hostname.id))!
    const urlRecord = (await getUrlById(url!.id))!
    const html = Buffer.from('<html>etag-matched</html>')

    mockSend.mockClear()
    mockSend.mockResolvedValueOnce({} as never)
    const firstCrawl = await createCrawl(url!.id, crawler.id)
    const firstUpdate = await persistCrawlContent({
      crawlId: firstCrawl.id,
      hostname,
      htmlResult: makeHtmlResult(html),
      previousHtmlSha256: null,
      previousHtmlSnapshotUploadedAt: null,
      url: urlRecord,
    })

    mockSend.mockClear()
    const secondCrawl = await createCrawl(url!.id, crawler.id)
    const secondUpdate = await persistCrawlContent({
      crawlId: secondCrawl.id,
      hostname,
      htmlResult: makeNotModifiedResult(),
      previousHtmlSha256: firstUpdate.html_sha256,
      previousHtmlSnapshotUploadedAt: firstUpdate.html_snapshot_uploaded_at,
      url: urlRecord,
    })

    expect(mockSend).not.toHaveBeenCalled()
    expect(secondUpdate.html_sha256).toEqual(firstUpdate.html_sha256)
    expect(secondUpdate.html_snapshot_uploaded_at).toEqual(firstUpdate.html_snapshot_uploaded_at)
  })

  it('clears html_sha256 on a 304 response when the previous snapshot is stale', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(
      user!.id,
      `https://content-dedupe-304-stale-${random}.example.com/page`,
    )
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const hostname = (await getUrlHostnameCrawlerDetailsById(url!.hostname.id))!
    const urlRecord = (await getUrlById(url!.id))!

    mockSend.mockClear()
    const crawl = await createCrawl(url!.id, crawler.id)
    const updated = await persistCrawlContent({
      crawlId: crawl.id,
      hostname,
      htmlResult: makeNotModifiedResult(),
      previousHtmlSha256: Buffer.alloc(32, 7),
      previousHtmlSnapshotUploadedAt: new Date(
        Date.now() - (CRAWL_HTML_SNAPSHOT_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000,
      ),
      url: urlRecord,
    })

    expect(mockSend).not.toHaveBeenCalled()
    expect(updated.html_sha256).toBeNull()
    expect(updated.html_snapshot_uploaded_at).toBeNull()
  })
})
