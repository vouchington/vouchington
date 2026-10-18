import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

describe('trending-rss-feeds', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  describe('GET /api/v1/rss-feeds/trending', () => {
    it.each([
      ['nonnumeric', 'abc'],
      ['repeated', '1&min_score=2'],
    ])('rejects a %s min_score', async (_kind, minScore) => {
      const request = createRequest()
      await request.get(`/api/v1/rss-feeds/trending?min_score=${minScore}`).expect(422)
    })

    it('returns 200 with results and page_info', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/rss-feeds/trending').expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body.page_info).toBeDefined()
    })

    it('includes rss_feeds map in response', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/rss-feeds/trending?limit=100').expect(200)

      expect(response.body.rss_feeds).toBeDefined()
    })

    it('returns cache-control header for anonymous users', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/rss-feeds/trending').expect(200)

      expect(response.headers['cache-control']).toContain('public')
      expect(response.headers['cache-control']).toContain(
        `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
      )
    })

    it('does not set cache-control for authenticated users', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get('/api/v1/rss-feeds/trending').expect(200)

      expect(response.headers['cache-control']).toBeUndefined()
    })

    it('returns 400 for invalid time_range', async () => {
      const request = createRequest()
      await request.get('/api/v1/rss-feeds/trending?time_range=year').expect(400)
    })

    it('returns 400 for negative min_score', async () => {
      const request = createRequest()
      await request.get('/api/v1/rss-feeds/trending?min_score=-1').expect(400)
    })
  })
})
