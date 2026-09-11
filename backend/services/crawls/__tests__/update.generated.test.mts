import { it, expect, beforeAll, describe } from 'vitest'
import { updateCrawl } from '../update.mts'
import { createCrawl } from '../create.mts'
import { addUrl } from '@services/urls/upsert'
import { createCrawler } from '@services/crawlers'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('update.generated', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
  })
  it('updateCrawl updates markdown and title', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://example.com/update-markdown-${random}`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const updated = await updateCrawl(crawl.id, url!.id, {
      markdown: '# Test Content',
      title: 'Test Title',
    })

    expect(updated.markdown).toBe('# Test Content')
    expect(updated.title).toBe('Test Title')
  })

  it('updateCrawl updates response headers and status code', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://example.com/update-headers-${random}`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const updated = await updateCrawl(crawl.id, url!.id, {
      response_headers: { 'content-type': 'text/html' },
      response_status_code: 404,
    })

    expect(updated.response_headers).toEqual({ 'content-type': 'text/html' })
    expect(updated.response_status_code).toBe(404)
  })

  it('updateCrawl updates links and meta_tags', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://example.com/update-links-${random}`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const updated = await updateCrawl(crawl.id, url!.id, {
      links: { homepage: 'https://example.com' },
      meta_tags: { description: 'Test description' },
    })

    expect(updated.links).toEqual({ homepage: 'https://example.com' })
    expect(updated.meta_tags).toEqual({ description: 'Test description' })
  })

  it('updateCrawl updates network error and completed_at', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://example.com/update-error-${random}`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const completedAt = new Date()
    const updated = await updateCrawl(crawl.id, url!.id, {
      network_error: 'timeout',
      completed_at: completedAt,
    })

    expect(updated.network_error).toBe('timeout')
    expect(updated.completed_at).toEqual(completedAt)
  })

  it('updateCrawl updates embeddings_generated_at', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://example.com/update-embeddings-${random}`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const embeddingsAt = new Date()
    const updated = await updateCrawl(crawl.id, url!.id, {
      embeddings_generated_at: embeddingsAt,
    })

    expect(updated.embeddings_generated_at).toEqual(embeddingsAt)
  })

  it('updateCrawl updates etag and last_modified_at', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://example.com/update-etag-${random}`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const lastModified = new Date('2025-01-15T00:00:00Z')
    const updated = await updateCrawl(crawl.id, url!.id, {
      etag: 'new-etag-456',
      last_modified_at: lastModified,
    })

    expect(updated.etag).toBe('new-etag-456')
    expect(updated.last_modified_at).toEqual(lastModified)
  })

  it('updateCrawl can set html_sha256', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://example.com/update-html-sha256-${random}`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const htmlSha256 = Buffer.alloc(32, 7)
    const updated = await updateCrawl(crawl.id, url!.id, {
      html_sha256: htmlSha256,
    })

    expect(updated.html_sha256).toEqual(htmlSha256)
  })

  it('updateCrawl can set html_snapshot_uploaded_at', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://example.com/update-html-uploaded-${random}`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const uploadedAt = new Date()
    const updated = await updateCrawl(crawl.id, url!.id, {
      html_snapshot_uploaded_at: uploadedAt,
    })

    expect(updated.html_snapshot_uploaded_at).toEqual(uploadedAt)
  })

  it('updateCrawl throws error for invalid URL ID', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://example.com/update-invalid-url-${random}`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    await expect(updateCrawl(crawl.id, 'not-a-uuid', { markdown: 'test' })).rejects.toThrow(
      'Invalid URL ID',
    )
  })

  it('updateCrawl throws error for invalid crawl ID', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://example.com/update-invalid-crawl-${random}`)
    await expect(updateCrawl('not-a-uuid', url!.id, { markdown: 'test' })).rejects.toThrow(
      'Invalid crawl ID',
    )
  })

  it('updateCrawl throws error when no fields provided', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://example.com/update-no-fields-${random}`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    await expect(updateCrawl(crawl.id, url!.id, {})).rejects.toThrow(
      'At least one field must be provided',
    )
  })

  it('updateCrawl throws 404 when crawl not found', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://example.com/update-not-found-${random}`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    // Use different URL ID
    const url2 = await addUrl(user!.id, `https://example.com/update-different-${random}`)
    await expect(updateCrawl(crawl.id, url2!.id, { markdown: 'test' })).rejects.toThrow(
      'Crawl not found',
    )
  })

  it('updateCrawl can set redirect_url_id', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://example.com/update-redirect-${random}`)
    const redirectUrl = await addUrl(user!.id, `https://example.com/redirect-target-${random}`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const updated = await updateCrawl(crawl.id, url!.id, {
      redirect_url_id: redirectUrl!.id,
    })

    expect(updated.redirect_url_id).toBe(redirectUrl!.id)
  })

  it('updateCrawl can update request_headers', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(user!.id, `https://example.com/update-req-headers-${random}`)
    const crawler = await createCrawler(user!, {
      hostname_id: url!.hostname.id,
      crawler_type: 'fetch',
    })
    const crawl = await createCrawl(url!.id, crawler.id)
    const updated = await updateCrawl(crawl.id, url!.id, {
      request_headers: { 'user-agent': 'test-bot' },
    })

    expect(updated.request_headers).toEqual({ 'user-agent': 'test-bot' })
  })
})
