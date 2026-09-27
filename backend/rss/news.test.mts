import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
// Register this package routes on the shared app singleton for route tests.
import './index.mts'
import { registerRssFeedRouteTests } from '../test-helpers/rss-feed-route-tests.mts'

describe('GET /rss/news', () => {
  const { freshKey } = registerRssFeedRouteTests('/rss/news', 'RSS News Test Key')

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
