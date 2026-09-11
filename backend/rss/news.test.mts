import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
// Register this package routes on the shared app singleton for route tests.
import './index.mts'
import { createTestUser } from '@voucha/test-helpers'
import { createApiKey } from '@services/api-keys'
import type { PrivateUser } from '@services/users/types'

describe('GET /rss/news', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  }, 30_000)

  async function freshKey() {
    const result = await createApiKey(
      user.id,
      'rss',
      `RSS News Test Key ${Math.random().toString(36).slice(2, 8)}`,
      ['rss-feeds:read'],
    )
    return result.rawKey
  }

  it('returns 200 with RSS XML for unauthenticated access (no apikey)', async () => {
    const request = createRequest()
    const response = await request.get('/rss/news').expect(200)
    expect(response.headers['content-type']).toContain('application/rss+xml')
    expect(response.text).toContain('<?xml')
    expect(response.text).toContain('<rss')
    expect(response.text).toContain('</rss>')
  })

  it('returns 403 for invalid apikey', async () => {
    const request = createRequest()
    await request.get('/rss/news?apikey=voucha_rss_invalid_key_invalid').expect(403)
  })

  it('returns 200 with RSS XML for valid apikey', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request.get(`/rss/news?apikey=${rawKey}`).expect(200)
    expect(response.headers['content-type']).toContain('application/rss+xml')
    expect(response.text).toContain('<?xml')
    expect(response.text).toContain('<rss')
    expect(response.text).toContain('</rss>')
  })

  it('returns 200 with topics filter', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request.get(`/rss/news?apikey=${rawKey}&topics=nonexistent`).expect(200)
    expect(response.text).toContain('<rss')
  })

  it('returns 200 with sources filter', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request.get(`/rss/news?apikey=${rawKey}&sources=nonexistent`).expect(200)
    expect(response.text).toContain('<rss')
  })

  it('returns 200 with both topics and sources filter', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request
      .get(`/rss/news?apikey=${rawKey}&topics=foo&sources=bar`)
      .expect(200)
    expect(response.text).toContain('<rss')
  })

  it('sets private cache and referrer headers when an API key is present', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request.get(`/rss/news?apikey=${rawKey}`).expect(200)
    expect(response.headers['cache-control']).toBe('private, max-age=300')
    expect(response.headers['referrer-policy']).toBe('no-referrer')
  })

  it('sets public cache headers for anonymous access', async () => {
    const request = createRequest()
    const response = await request.get('/rss/news').expect(200)
    expect(response.headers['cache-control']).toBe('public, max-age=300')
    expect(response.headers['referrer-policy']).toBeUndefined()
  })

  it('returns ETag header', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request.get(`/rss/news?apikey=${rawKey}`).expect(200)
    expect(response.headers['etag']).toMatch(/^"[A-Za-z0-9_-]+"$/)
  })

  it('descriptions do not contain script tags or event handlers', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request.get(`/rss/news?apikey=${rawKey}`).expect(200)
    expect(response.text).not.toContain('<script')
    const descriptions = [
      ...response.text.matchAll(
        /<description>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/description>/g,
      ),
    ].map(m => m[1] ?? m[2] ?? '')
    expect(descriptions.length).toBeGreaterThan(0)
    for (const desc of descriptions) {
      // No inline event handler attributes (e.g. onclick=, onload=) inside HTML tags
      expect(desc).not.toMatch(/<[^>]*\bon\w+\s*=/i)
    }
  })

  it('returns 200 with category_topic filter', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request
      .get(`/rss/news?apikey=${rawKey}&category_topic=nonexistent`)
      .expect(200)
    expect(response.text).toContain('<rss')
  })
})
