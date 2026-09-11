import { describe, expect, it } from 'vitest'
import { isCsrEmptyShell } from './csr-detection.mts'
import type { CrawlBasic } from './types.mts'

function makeCrawl(overrides: Partial<CrawlBasic> = {}): CrawlBasic {
  return {
    __entity_type: 'crawl',
    id: '00000000-0000-0000-0000-000000000001',
    url_id: '00000000-0000-0000-0000-000000000002',
    crawler_id: '00000000-0000-0000-0000-000000000003',
    created_at: new Date(),
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
    markdown: 'This is a full page with plenty of content to read.',
    title: 'Test Page',
    links: {},
    meta_tags: {},
    lang: 'en',
    ...overrides,
    embed_metadata: overrides.embed_metadata ?? null,
    embed_oembed_url: overrides.embed_oembed_url ?? null,
    embed_oembed_resolved_at: overrides.embed_oembed_resolved_at ?? null,
  }
}

describe('isCsrEmptyShell', () => {
  it('returns false for a normal page with content', () => {
    expect(isCsrEmptyShell(makeCrawl())).toBe(false)
  })

  it('returns true for a 200 page with title but no markdown', () => {
    expect(isCsrEmptyShell(makeCrawl({ markdown: '', title: 'React App' }))).toBe(true)
  })

  it('returns true for a 200 page with title but very short markdown', () => {
    expect(isCsrEmptyShell(makeCrawl({ markdown: 'Loading...', title: 'React App' }))).toBe(true)
  })

  it('returns false for non-200 status', () => {
    expect(
      isCsrEmptyShell(makeCrawl({ response_status_code: 404, markdown: '', title: 'Not Found' })),
    ).toBe(false)
  })

  it('returns false when there is no title', () => {
    expect(isCsrEmptyShell(makeCrawl({ markdown: '', title: null }))).toBe(false)
  })

  it('returns false when title is just whitespace', () => {
    expect(isCsrEmptyShell(makeCrawl({ markdown: '', title: '  ' }))).toBe(false)
  })
})
