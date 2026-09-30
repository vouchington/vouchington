import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const feeds = [
  { kind: 'posts', path: '/api/v1/feeds/posts/follow_users' },
  { kind: 'rss_feed_items', path: '/api/v1/feeds/rss_feed_items/follow_rss_feeds' },
  { kind: 'referral_links', path: '/api/v1/feeds/referral_links/follow_users' },
] as const

describe('feed routes - request contract validation', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  }, 60_000)

  describe.each(feeds)('$kind feed', ({ kind, path }) => {
    it('returns 401 without a validation diagnostic for an anonymous caller', async () => {
      const response = await createRequest().get(`${path}?limit=abc&extra=1`).expect(401)
      expect(response.body.message).toBe('Unauthorized')
    })

    it('keeps the 404 for an unknown feed type before any query diagnostic', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.get(`/api/v1/feeds/${kind}/not_a_feed?limit=abc`).expect(404)
    })

    it('keeps the parser 400 for a malformed limit', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.get(path).query({ limit: 'abc' }).expect(400)
    })

    it('keeps serving a valid limit', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.get(path).query({ limit: 10 }).expect(200)
    })
  })

  describe('feed-specific query keys', () => {
    it.each([
      ['posts', '/api/v1/feeds/posts/follow_users', { sort: 'oldest' }],
      ['posts', '/api/v1/feeds/posts/follow_users', { min_score_follow_users: 'abc' }],
      ['posts', '/api/v1/feeds/posts/follow_users', { community: ['a', 'b'] }],
      [
        'rss_feed_items',
        '/api/v1/feeds/rss_feed_items/follow_rss_feeds',
        { has_related_posts: 'maybe' },
      ],
      [
        'rss_feed_items',
        '/api/v1/feeds/rss_feed_items/follow_rss_feeds',
        { min_score_follow_rss_feeds: 'abc' },
      ],
    ])('returns 422 for a malformed %s filter', async (_kind, path, query) => {
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request.get(path).query(query).expect(422)
      expect(response.body.message).toBe('Invalid request query')
    })

    it('keeps serving valid feed-specific filters', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .get('/api/v1/feeds/posts/follow_users')
        .query({ sort: 'hot', min_score_follow_users: 0, min_score_follow_topics: 0 })
        .expect(200)
      await request
        .get('/api/v1/feeds/rss_feed_items/follow_rss_feeds')
        .query({ has_related_posts: 'true', min_score_follow_rss_feeds: 0 })
        .expect(200)
    })
  })

  describe('rss_feed_items media_type filter', () => {
    const rssPath = '/api/v1/feeds/rss_feed_items/follow_rss_feeds'

    it.each(['audio', 'audio,video', 'article,audio,video'])(
      'keeps serving the comma-separated media_type %s',
      async mediaType => {
        const request = createRequest()
        await request.authenticateAs(user)
        await request.get(rssPath).query({ media_type: mediaType }).expect(200)
      },
    )

    it('keeps serving repeated media_type values', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.get(`${rssPath}?media_type=audio&media_type=video`).expect(200)
    })

    it('returns 422 for an unknown media_type member', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .get(rssPath)
        .query({ media_type: 'audio,hologram' })
        .expect(422)
      expect(response.body.message).toBe('Invalid request query')
    })
  })
})
