import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
// Register this package routes on the shared app singleton for route tests.
import './index.mts'
import { createTestUser } from '@voucha/test-helpers'
import { createApiKey } from '@services/api-keys'
import type { PrivateUser } from '@services/users/types'

describe('GET /rss/posts', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  }, 30_000)

  async function freshKey() {
    const result = await createApiKey(
      user.id,
      'rss',
      `RSS Test Key ${Math.random().toString(36).slice(2, 8)}`,
      ['rss-feeds:read'],
    )
    return result.rawKey
  }

  it('returns 200 with RSS XML for unauthenticated access (no apikey)', async () => {
    const request = createRequest()
    const response = await request.get('/rss/posts').expect(200)
    expect(response.headers['content-type']).toContain('application/rss+xml')
    expect(response.text).toContain('<?xml')
    expect(response.text).toContain('<rss')
    expect(response.text).toContain('</rss>')
  })

  it('returns 403 for invalid apikey', async () => {
    const request = createRequest()
    await request.get('/rss/posts?apikey=voucha_rss_invalid_key_invalid').expect(403)
  })

  it('returns 200 with RSS XML for valid apikey', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request.get(`/rss/posts?apikey=${rawKey}`).expect(200)
    expect(response.headers['content-type']).toContain('application/rss+xml')
    expect(response.text).toContain('<?xml')
    expect(response.text).toContain('<rss')
    expect(response.text).toContain('</rss>')
  })

  it('returns 400 for invalid post_type', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    await request.get(`/rss/posts?apikey=${rawKey}&post_type=invalid`).expect(400)
  })

  it('returns 200 with valid post_type filter', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request
      .get(`/rss/posts?apikey=${rawKey}&post_type=discussion`)
      .expect(200)
    expect(response.text).toContain('<rss')
  })

  it('returns 200 with topics filter', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request.get(`/rss/posts?apikey=${rawKey}&topics=nonexistent`).expect(200)
    expect(response.text).toContain('<rss')
  })

  it('returns 200 with user filter', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request
      .get(`/rss/posts?apikey=${rawKey}&user=nonexistent-user`)
      .expect(200)
    expect(response.text).toContain('<rss')
  })

  it('sets private cache and referrer headers when an API key is present', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request.get(`/rss/posts?apikey=${rawKey}`).expect(200)
    expect(response.headers['cache-control']).toBe('private, max-age=300')
    expect(response.headers['referrer-policy']).toBe('no-referrer')
  })

  it('sets public cache headers for anonymous access', async () => {
    const request = createRequest()
    const response = await request.get('/rss/posts').expect(200)
    expect(response.headers['cache-control']).toBe('public, max-age=300')
    expect(response.headers['referrer-policy']).toBeUndefined()
  })

  it('returns ETag header', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request.get(`/rss/posts?apikey=${rawKey}`).expect(200)
    expect(response.headers['etag']).toMatch(/^"[A-Za-z0-9_-]+"$/)
  })

  it('descriptions contain HTML not raw markdown, no script tags, no event handlers', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request.get(`/rss/posts?apikey=${rawKey}`).expect(200)
    const descriptions = [
      ...response.text.matchAll(
        /<description>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/description>/g,
      ),
    ].map(m => m[1] ?? m[2] ?? '')
    expect(descriptions.length).toBeGreaterThan(0)
    for (const desc of descriptions) {
      // No raw markdown bold syntax
      expect(desc).not.toMatch(/\*\*[^*]+\*\*/)
      // No script tags
      expect(desc).not.toContain('<script')
      // No inline event handler attributes (e.g. onclick=, onload=) inside HTML tags
      expect(desc).not.toMatch(/<[^>]*\bon\w+\s*=/i)
    }
  })
})
