import { describe, expect, it } from 'vitest'
import type { CrawlBasic } from '../types.mts'
import { toPaidSafeUrlCrawlHistory } from '../public-url-response.mts'

describe('public-url-response', () => {
  const crawl: CrawlBasic = {
    __entity_type: 'crawl',
    id: '11111111-1111-1111-1111-111111111111',
    url_id: '22222222-2222-2222-2222-222222222222',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    crawler_id: '33333333-3333-3333-3333-333333333333',
    last_modified_at: new Date('2026-01-02T00:00:00.000Z'),
    etag: 'etag-value',
    html_sha256: Buffer.alloc(32, 1),
    html_snapshot_uploaded_at: new Date('2026-01-03T00:00:00.000Z'),
    request_headers: { 'user-agent': 'test-bot' },
    response_headers: { 'content-type': 'text/html' },
    response_status_code: 200,
    redirect_url_id: '44444444-4444-4444-4444-444444444444',
    network_error: null,
    completed_at: new Date('2026-01-04T00:00:00.000Z'),
    has_pending_embeddings: false,
    embeddings_generated_at: new Date('2026-01-05T00:00:00.000Z'),
    markdown: 'Public content',
    title: 'Test title',
    links: { a: ['/alpha'] },
    meta_tags: { 'og:title': 'Test title' },
    embed_metadata: null,
    embed_oembed_url: null,
    embed_oembed_resolved_at: null,
    lang: 'en',
  }

  it('builds the paid-safe crawl history allow-list', () => {
    const summary = toPaidSafeUrlCrawlHistory(crawl)

    expect(summary).toStrictEqual({
      __entity_type: 'crawl',
      id: crawl.id,
      created_at: crawl.created_at,
      response_status_code: crawl.response_status_code,
      completed_at: crawl.completed_at,
      title: crawl.title,
      lang: crawl.lang,
    })
  })

  it('uses the same paid-safe projection for a crawl detail', () => {
    const detail = toPaidSafeUrlCrawlHistory(crawl)

    expect(detail).toStrictEqual({
      __entity_type: 'crawl',
      id: crawl.id,
      created_at: crawl.created_at,
      response_status_code: crawl.response_status_code,
      completed_at: crawl.completed_at,
      title: crawl.title,
      lang: crawl.lang,
    })

    expect(Object.keys(detail).sort()).toEqual(
      [
        '__entity_type',
        'completed_at',
        'created_at',
        'id',
        'lang',
        'response_status_code',
        'title',
      ].sort(),
    )
  })
})
