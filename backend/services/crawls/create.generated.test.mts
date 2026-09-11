import { it, expect, beforeAll, describe } from 'vitest'
import { createCrawl } from './create.mts'
import { addUrl } from '@services/urls/upsert'
import { createCrawler } from '@services/crawlers'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('create.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('createCrawl creates a crawl with required fields', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/create-crawl-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    expect(crawl).toBeDefined()
    expect(crawl.__entity_type).toBe('crawl')
    expect(crawl.url_id).toBe(url!.id)
    expect(crawl.crawler_id).toBe(crawler.id)
    expect(crawl.id).toBeDefined()
    expect(crawl.created_at).toBeInstanceOf(Date)
    expect(crawl.response_status_code).toBe(200)
    expect(crawl.markdown).toBe('')
    expect(crawl.request_headers).toEqual({})
    expect(crawl.response_headers).toEqual({})
  })

  it('createCrawl creates a crawl with optional fields', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/create-crawl-opts-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const lastModifiedAt = new Date('2025-01-01T00:00:00Z')
    const crawl = await createCrawl(url!.id, crawler.id, {
      last_modified_at: lastModifiedAt,
      etag: 'test-etag-123',
    })
    expect(crawl.last_modified_at).toEqual(lastModifiedAt)
    expect(crawl.etag).toBe('test-etag-123')
  })

  it('createCrawl throws error for invalid URL ID', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/create-crawl-invalid-url-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    await expect(createCrawl('not-a-uuid', crawler.id)).rejects.toThrow('Invalid URL ID')
  })

  it('createCrawl throws error for invalid crawler ID', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/create-invalid-crawler-${random}`)
    await expect(createCrawl(url!.id, 'not-a-uuid')).rejects.toThrow('Invalid crawler ID')
  })

  it('createCrawl sets null for optional fields when not provided', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user.id, `https://example.com/create-null-fields-${random}`)
    const crawler = await createCrawler(user, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    expect(crawl.last_modified_at).toBeNull()
    expect(crawl.etag).toBeNull()
    expect(crawl.network_error).toBeNull()
    expect(crawl.completed_at).toBeNull()
    expect(crawl.embeddings_generated_at).toBeNull()
  })
})
