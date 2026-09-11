import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

describe('platform-stats', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('Platform Stats API Routes', () => {
    describe('GET /api/v1/platform-stats', () => {
      it('should return all expected count fields', async () => {
        const request = createRequest()
        const response = await request.get('/api/v1/platform-stats').expect(200)

        expect(response.body).toHaveProperty('topic_count')
        expect(response.body).toHaveProperty('rss_feed_count')
        expect(response.body).toHaveProperty('post_count')
        expect(response.body).toHaveProperty('review_count')
        expect(response.body).toHaveProperty('data_point_count')
        expect(response.body).toHaveProperty('hostname_count')

        expect(typeof response.body.topic_count).toBe('number')
        expect(typeof response.body.rss_feed_count).toBe('number')
        expect(typeof response.body.post_count).toBe('number')
        expect(typeof response.body.review_count).toBe('number')
        expect(typeof response.body.data_point_count).toBe('number')
        expect(typeof response.body.hostname_count).toBe('number')
      })

      it('should set Cache-Control header for anonymous requests', async () => {
        const request = createRequest()
        const response = await request.get('/api/v1/platform-stats').expect(200)

        expect(response.headers['cache-control']).toContain('public')
        expect(response.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
        )
      })

      it('should not set public Cache-Control header for authenticated requests', async () => {
        const request = createRequest()
        await request.authenticateAs(user)
        const response = await request.get('/api/v1/platform-stats').expect(200)

        expect(response.headers['cache-control'] ?? '').not.toContain('public')
      })
    })
  })
})
