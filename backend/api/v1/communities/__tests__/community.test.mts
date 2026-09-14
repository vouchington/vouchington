import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestPost,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityListItem,
  insertTestRssFeedItem,
  insertTestUrl,
  insertTestUrlHostname,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  createTestTopic,
  createRandomString,
  createEntityRelationWithElection,
  addCategoryToRssFeedItem,
} from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'
import { VALID_COMMUNITY_NEWS_FEED_TYPES } from '@ts-shared/feed-capabilities'

import { createHash } from 'node:crypto'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

describe('community', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('Community Individual Routes', () => {
    describe('GET /api/v1/communities/:slug', () => {
      it('returns community and membership', async () => {
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: user.id,
          slug: `community-get-${random}`,
        })

        const request = createRequest()
        await request.authenticateAs(user)
        const response = await request.get(`/api/v1/communities/${community.slug}`).expect(200)

        expect(response.body.community.id).toBe(community.id)
        expect(response.body).toHaveProperty('membership')
      })

      it('returns owner in user field', async () => {
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: user.id,
          slug: `community-get-owner-${random}`,
        })

        const request = createRequest()
        const response = await request.get(`/api/v1/communities/${community.slug}`).expect(200)

        expect(response.body).toHaveProperty('user')
        expect(response.body.user).not.toBeNull()
        expect(response.body.user.id).toBe(user.id)
        expect(response.body.user.username).toBe(user.username)
        expect(response.headers['cache-control']).toContain('public')
        expect(response.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
        )
        expect(response.headers['vary']).toContain('Cookie')
        expect(response.headers['vary']).toContain('Authorization')
      })

      it('returns community_metrics', async () => {
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: user.id,
          slug: `community-get-metrics-${random}`,
        })

        const request = createRequest()
        const response = await request.get(`/api/v1/communities/${community.slug}`).expect(200)

        expect(response.body).toHaveProperty('community_metrics')
        expect(response.body.community_metrics).toHaveProperty('member_count')
        expect(response.body.community_metrics).toHaveProperty('virtual_subscription_count')
        expect(response.body.community_metrics).toHaveProperty('proxy_follow_count')
        expect(response.body.community_metrics).toHaveProperty('proxy_mute_count')
        expect(response.body.community_metrics).toHaveProperty('list_item_count')
      })

      it('returns community with list_type', async () => {
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: user.id,
          slug: `community-get-lt-${random}`,
          list_type: 'mute',
        })

        const request = createRequest()
        const response = await request.get(`/api/v1/communities/${community.slug}`).expect(200)

        expect(response.body.community.list_type).toBe('mute')
      })

      it('returns 404 for nonexistent community', async () => {
        const request = createRequest()
        await request.get('/api/v1/communities/nonexistent-community-xyz-404').expect(404)
      })
    })

    describe('GET /api/v1/communities/:slug/news', () => {
      it('returns RSS feed items from the community list without authentication', async () => {
        const random = createRandomString(8)
        const topic = await createTestTopic({ user })
        const feedId = await createTestRssFeedWithTiming(topic.id)
        const item = await createTestRssFeedItemWithUrl(feedId)
        const community = await insertTestCommunity({
          createdById: user.id,
          slug: `community-news-${random}`,
        })
        await insertTestCommunityListItem({
          communityId: community.id,
          itemType: 'rss_feed',
          entityId: feedId,
        })

        const request = createRequest()
        const response = await request.get(`/api/v1/communities/${community.slug}/news`).expect(200)

        expect(
          response.body.results.map((result: { entity_id: string }) => result.entity_id),
        ).toContain(item.id)
        expect(response.body.rss_feed_items[item.id]).toBeDefined()
        expect(response.body.users).toEqual({})
      })

      it('returns public related discussions without authentication', async () => {
        const random = createRandomString(8)
        const topic = await createTestTopic({ user })
        const feedId = await createTestRssFeedWithTiming(topic.id)
        const hostnameId = await insertTestUrlHostname({
          hostname: `community-news-related-${random}.example.com`,
        })
        const urlId = await insertTestUrl({
          url: `https://community-news-related-${random}.example.com/article`,
          hostnameId,
        })
        const itemId = await insertTestRssFeedItem({
          rssFeedId: feedId,
          urlId,
          guid: `community-news-related-${random}`,
          itemData: { title: `Community News Related ${random}` },
          contentSha256: createHash('sha256').update(random).digest(),
        })
        const relatedPost = await createTestPost({
          user,
          post_type: 'discussion',
          privacy: 'public',
          is_anonymous: true,
        })
        await createEntityRelationWithElection(relatedPost.id, urlId, user.id, 1)
        const community = await insertTestCommunity({
          createdById: user.id,
          slug: `community-news-related-${random}`,
        })
        await insertTestCommunityListItem({
          communityId: community.id,
          itemType: 'rss_feed',
          entityId: feedId,
        })

        const request = createRequest()
        const response = await request.get(`/api/v1/communities/${community.slug}/news`).expect(200)

        expect(
          response.body.results.map((result: { entity_id: string }) => result.entity_id),
        ).toContain(itemId)
        expect(response.body.related_posts_by_url_id[urlId]).toContain(relatedPost.id)
        expect(response.body.posts[relatedPost.id]).toBeDefined()
        expect(response.body.posts[relatedPost.id].created_by_id).toBeNull()
      })

      it('filters community news by listed sources or listed topics', async () => {
        const random = createRandomString(8)
        const sourceTopic = await createTestTopic({ user })
        const otherFeedTopic = await createTestTopic({ user })
        const categoryTopic = await createTestTopic({ user })
        const sourceFeedId = await createTestRssFeedWithTiming(sourceTopic.id)
        const categoryFeedId = await createTestRssFeedWithTiming(otherFeedTopic.id)
        const sourceItem = await createTestRssFeedItemWithUrl(sourceFeedId)
        const categoryItem = await createTestRssFeedItemWithUrl(categoryFeedId)
        await addCategoryToRssFeedItem(categoryItem.id, categoryTopic.id)
        const community = await insertTestCommunity({
          createdById: user.id,
          slug: `community-news-filter-${random}`,
        })
        await insertTestCommunityListItem({
          communityId: community.id,
          itemType: 'rss_feed',
          entityId: sourceFeedId,
        })
        await insertTestCommunityListItem({
          communityId: community.id,
          itemType: 'topic',
          entityId: categoryTopic.id,
        })

        const request = createRequest()
        const sourceResponse = await request
          .get(`/api/v1/communities/${community.slug}/news?feed_type=follow_rss_feeds`)
          .expect(200)
        const topicResponse = await request
          .get(`/api/v1/communities/${community.slug}/news?feed_type=follow_topics`)
          .expect(200)

        expect(
          sourceResponse.body.results.map((result: { entity_id: string }) => result.entity_id),
        ).toContain(sourceItem.id)
        expect(
          sourceResponse.body.results.map((result: { entity_id: string }) => result.entity_id),
        ).not.toContain(categoryItem.id)
        expect(
          topicResponse.body.results.map((result: { entity_id: string }) => result.entity_id),
        ).toContain(categoryItem.id)
        expect(
          topicResponse.body.results.map((result: { entity_id: string }) => result.entity_id),
        ).not.toContain(sourceItem.id)
      })

      it('rejects invalid community news feed_type values', async () => {
        const random = createRandomString(8)
        const community = await insertTestCommunity({
          createdById: user.id,
          slug: `community-news-invalid-filter-${random}`,
        })

        const response = await createRequest()
          .get(`/api/v1/communities/${community.slug}/news?feed_type=invalid`)
          .expect(422)

        expect(response.body.message).toContain('Invalid feed_type')
        expect(response.body.message).toContain(VALID_COMMUNITY_NEWS_FEED_TYPES.join(', '))
      })

      it('includes rss_feed_item_thumbnail_url sidecar in response', async () => {
        const random = createRandomString(8)
        const topic = await createTestTopic({ user })
        const feedId = await createTestRssFeedWithTiming(topic.id)
        await createTestRssFeedItemWithUrl(feedId)
        const community = await insertTestCommunity({
          createdById: user.id,
          slug: `community-news-thumb-${random}`,
        })
        await insertTestCommunityListItem({
          communityId: community.id,
          itemType: 'rss_feed',
          entityId: feedId,
        })

        const response = await createRequest()
          .get(`/api/v1/communities/${community.slug}/news`)
          .expect(200)

        expect(response.body.rss_feed_item_thumbnail_url).toBeDefined()
        expect(response.body.rss_feed_item_embeds).toBeDefined()
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof insertTestCommunityMember)
})
