import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
// Register this package routes on the shared app singleton for route tests.
import './index.mts'
import { registerRssFeedRouteTests } from '../test-helpers/rss-feed-route-tests.mts'

describe('GET /rss/posts', () => {
  const { freshKey } = registerRssFeedRouteTests('/rss/posts', 'RSS Test Key')

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

  it('returns 200 with user filter', async () => {
    const rawKey = await freshKey()
    const request = createRequest()
    const response = await request
      .get(`/rss/posts?apikey=${rawKey}&user=nonexistent-user`)
      .expect(200)
    expect(response.text).toContain('<rss')
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
      expect(desc).not.toMatch(/\*\*[^*]+\*\*/)
      expect(desc).not.toContain('<script')
      expect(desc).not.toMatch(/<[^>]*\bon\w+\s*=/i)
    }
  })
})
