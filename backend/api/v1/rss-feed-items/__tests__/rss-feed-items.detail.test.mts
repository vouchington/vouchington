import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  followUser,
  insertTestRssFeedItem,
  createTestUser,
  createTestUserWithAge,
  createTestTopic,
  createTestRssFeedWithTiming,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls'
import { insertTestCrawl } from '@voucha/test-helpers/entities/crawls'
import { createHash } from 'node:crypto'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
describe('RSS Feed Items Routes', () => {
  describe('GET /api/v1/rss-feed-items/:id', () => {
    it('returns raw crawl fields only to administrators', async () => {
      const viewer = await createTestUser()
      const administrator = await createTestUser({ administrator: true })
      const topic = await createTestTopic({ user: viewer })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const guid = `crawl-access-${Math.random().toString(36).slice(2, 10)}`
      const url = await addUrl(null, `https://example.com/${guid}`, { content_type: 'text/html' })
      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: url!.id,
        guid,
        itemData: { title: `Crawl access ${guid}` },
        contentSha256: createHash('sha256').update(`${guid}-crawl-access`).digest(),
      })
      const metaTags = { 'og:title': 'Administrator-only raw title' }
      await insertTestCrawl({
        urlId: url!.id,
        statusCode: 200,
        markdown: 'Administrator-only extracted content',
        metaTags,
        embedOEmbedUrl: 'https://example.com/oembed',
        embedOEmbedResolvedAt: new Date('2026-09-01T00:00:00.000Z'),
      })

      const publicResponse = await createRequest()
        .get(`/api/v1/rss-feed-items/${itemId}`)
        .expect(200)
      expect(publicResponse.body.rss_feed_item_embeds[itemId]).toMatchObject({
        title: 'Administrator-only raw title',
        markdown: null,
        meta_tags: null,
        embed_oembed_url: null,
        embed_oembed_resolved_at: null,
      })

      const memberRequest = createRequest()
      await memberRequest.authenticateAs(viewer)
      const memberResponse = await memberRequest.get(`/api/v1/rss-feed-items/${itemId}`).expect(200)
      expect(memberResponse.body.rss_feed_item_embeds[itemId]).toMatchObject({
        title: 'Administrator-only raw title',
        markdown: null,
        embed_metadata: null,
        meta_tags: null,
        embed_oembed_url: null,
        embed_oembed_resolved_at: null,
      })

      const administratorRequest = createRequest()
      await administratorRequest.authenticateAs(administrator)
      const administratorResponse = await administratorRequest
        .get(`/api/v1/rss-feed-items/${itemId}`)
        .expect(200)
      expect(administratorResponse.body.rss_feed_item_embeds[itemId]).toMatchObject({
        markdown: 'Administrator-only extracted content',
        meta_tags: metaTags,
        embed_oembed_url: 'https://example.com/oembed',
        embed_oembed_resolved_at: '2026-09-01T00:00:00.000Z',
      })
    })

    it('returns rss feed item detail with authenticated viewer vote', async () => {
      const viewer = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const topic = await createTestTopic({ user: viewer })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const guid = `detail-guid-${Math.random().toString(36).slice(2, 10)}`
      const url = await addUrl(null, `https://example.com/${guid}`, { content_type: 'text/html' })
      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: url!.id,
        guid,
        itemData: { title: `Detail ${guid}` },
        contentSha256: createHash('sha256').update(`${guid}-detail`).digest(),
      })

      const request = createRequest()
      await request.authenticateAs(viewer)

      await request
        .put(`/api/v1/rss-feed-items/${itemId}/vote`)
        .send({ choice: 'like' })
        .expect(204)

      const response = await request.get(`/api/v1/rss-feed-items/${itemId}`).expect(200)

      expect(response.body.rss_feed_item.id).toBe(itemId)
      expect(response.body.rss_feed_item.guid).toBe(guid)
      expect(response.body.election_vote).toMatchObject({
        entity_id: itemId,
        user_id: viewer.id,
        choice: 'like',
      })
    })

    it('returns streaming shape with rss_feed_item and rss_feed_item_election', async () => {
      const viewer = await createTestUser()
      const topic = await createTestTopic({ user: viewer })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const guid = `streaming-shape-${Math.random().toString(36).slice(2, 10)}`
      const url = await addUrl(null, `https://example.com/${guid}`, { content_type: 'text/html' })
      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: url!.id,
        guid,
        itemData: { title: `Streaming ${guid}` },
        contentSha256: createHash('sha256').update(`${guid}-streaming`).digest(),
      })

      const request = createRequest()
      const response = await request.get(`/api/v1/rss-feed-items/${itemId}`).expect(200)

      expect(response.body.rss_feed_item).toBeDefined()
      expect(response.body.rss_feed_item.id).toBe(itemId)
      expect(response.body.rss_feed_item.election).toBeUndefined()
      expect(response.body.rss_feed_item_election).toBeDefined()
      expect(response.body.rss_feed_item_embeds[itemId]).toMatchObject({
        rss_feed_item_id: itemId,
        source_url: url!.url,
        embed_metadata: null,
        meta_tags: null,
        embed_oembed_url: null,
        embed_oembed_resolved_at: null,
      })
      // Should NOT have page_info — this is a single-entity endpoint
      expect(response.body.page_info).toBeUndefined()
      expect(response.body.results).toBeUndefined()
      expect(response.body.rss_feed_item_embeds).toHaveProperty(itemId)
      expect(response.headers['cache-control']).toContain('public')
      expect(response.headers['cache-control']).toContain(
        `max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
      )
      expect(response.headers['vary']).toContain('Cookie')
      expect(response.headers['vary']).toContain('Authorization')
    })

    it('returns rss_feed_item_election for unauthenticated users', async () => {
      const viewer = await createTestUser()
      const topic = await createTestTopic({ user: viewer })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const guid = `election-guid-${Math.random().toString(36).slice(2, 10)}`
      const url = await addUrl(null, `https://example.com/${guid}`, { content_type: 'text/html' })
      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: url!.id,
        guid,
        itemData: { title: `Election ${guid}` },
        contentSha256: createHash('sha256').update(`${guid}-election`).digest(),
      })

      const request = createRequest()
      const response = await request.get(`/api/v1/rss-feed-items/${itemId}`).expect(200)

      expect(response.body.rss_feed_item.election).toBeUndefined()
      expect(response.body.rss_feed_item_election).toBeDefined()
      expect(response.body.rss_feed_item_election).toHaveProperty('votes_score_net')
      expect(response.body.rss_feed_item_election).toHaveProperty('votes_count_up')
      expect(response.body.rss_feed_item_election).toHaveProperty('votes_count_down')
    })
  })

  describe('GET /api/v1/rss-feed-items/:id/follow-context', () => {
    it('returns only followed-user rss item votes', async () => {
      const viewer = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const followedUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const unfollowedUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      const topic = await createTestTopic({ user: viewer })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const guid = `follow-context-guid-${Math.random().toString(36).slice(2, 10)}`
      const url = await addUrl(null, `https://example.com/${guid}`, { content_type: 'text/html' })
      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: url!.id,
        guid,
        itemData: { title: `Follow Context ${guid}` },
        contentSha256: createHash('sha256').update(`${guid}-follow-context`).digest(),
      })

      await followUser(viewer, followedUser)

      const followedRequest = createRequest()
      await followedRequest.authenticateAs(followedUser)
      await followedRequest
        .put(`/api/v1/rss-feed-items/${itemId}/vote`)
        .send({ choice: 'like' })
        .expect(204)

      const unfollowedRequest = createRequest()
      await unfollowedRequest.authenticateAs(unfollowedUser)
      await unfollowedRequest
        .put(`/api/v1/rss-feed-items/${itemId}/vote`)
        .send({ choice: 'dislike' })
        .expect(204)

      const request = createRequest()
      await request.authenticateAs(viewer)
      const response = await request
        .get(`/api/v1/rss-feed-items/${itemId}/follow-context`)
        .expect(200)

      expect(response.body.positive_by_following.total).toBe(1)
      expect(response.body.positive_by_following.users).toHaveLength(1)
      expect(response.body.positive_by_following.users[0].id).toBe(followedUser.id)
      expect(response.body.negative_by_following.total).toBe(0)
      expect(response.body.negative_by_following.users).toHaveLength(0)
    })
  })
})
