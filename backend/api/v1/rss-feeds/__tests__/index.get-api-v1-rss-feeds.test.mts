import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  insertTestTopic,
  insertTestRssFeed,
  createTestUser,
  addRssFeedTopicPublisherType,
  insertEntityRelation,
} from '@voucha/test-helpers'

import { createTopicAliases } from '@services/topics/aliases'

import { upsertEntityRelation } from '@services/entity-relations'

import { entityRelationMetadatum } from '@services/entity-relations/metadata'

import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

import { upsertTopicElectionVotes } from '@services/elections-votes/topic'

import type { PrivateUser } from '@services/users/types'

describe('index', () => {
  describe('RSS Feeds Routes', () => {
    let user: PrivateUser

    beforeAll(async () => {
      user = await createTestUser()
    })

    describe('GET /api/v1/rss-feeds', () => {
      it('should return rss feeds and cache headers for logged-out users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Feed Topic ${random}`,
          slug: `feed-topic-${random}`,
          createdById: user.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Feed ${random}`,
        })
        const request = createRequest()
        const response = await request.get(`/api/v1/rss-feeds?topic=${topicId}`).expect(200)

        expect(Array.isArray(response.body.results)).toBe(true)
        expect(
          response.body.results.find((feed: { id: string }) => feed.id === feedId),
        ).toBeDefined()
        expect(response.headers['cache-control']).toContain('public')
        expect(response.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
        )
      })

      it('should support topic alias filter', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Alias Feed Topic ${random}`,
          slug: `alias-feed-topic-${random}`,
          createdById: user.id,
        })
        const alias = `alias-feed-${random}`
        await createTopicAliases(topicId, alias)

        const feedId = await insertTestRssFeed({
          topicId,
          title: `Alias Feed ${random}`,
        })
        const request = createRequest()
        const response = await request.get(`/api/v1/rss-feeds?topic=${alias}`).expect(200)

        expect(Array.isArray(response.body.results)).toBe(true)
        expect(
          response.body.results.find((feed: { id: string }) => feed.id === feedId),
        ).toBeDefined()
      })

      it('should only apply publisher type mutes when requested', async () => {
        const currentUser = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Muted Publisher Feed Topic ${random}`,
          slug: `muted-publisher-feed-topic-${random}`,
          createdById: currentUser.id,
        })
        const publisherTypeId = await insertTestTopic({
          name: `Muted Publisher Type ${random}`,
          slug: `muted-publisher-type-${random}`,
          createdById: currentUser.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Muted Publisher Feed ${random}`,
        })
        await addRssFeedTopicPublisherType(topicId, publisherTypeId)
        await insertEntityRelation('relation__user__mute__topic', currentUser.id, publisherTypeId)

        const request = createRequest()
        await request.authenticateAs(currentUser)

        const defaultResponse = await request.get(`/api/v1/rss-feeds?topic=${topicId}`).expect(200)
        expect(
          defaultResponse.body.results.find((feed: { id: string }) => feed.id === feedId),
        ).toBeDefined()

        const mutedResponse = await request
          .get(`/api/v1/rss-feeds?topic=${topicId}&apply_mutes=1`)
          .expect(200)
        expect(mutedResponse.body.results.find((feed: { id: string }) => feed.id === feedId)).toBe(
          undefined,
        )
      })

      it('anonymous GET includes topic_elections sidecar and no election_votes map', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Election Anon Topic ${random}`,
          slug: `election-anon-topic-${random}`,
          createdById: user.id,
        })
        await insertTestRssFeed({
          topicId,
          title: `Election Anon Feed ${random}`,
          homePageUrl: `https://election-anon-${random}.example.com/home`,
          rssFeedUrl: `https://election-anon-${random}.example.com/feed.xml`,
        })
        const request = createRequest()
        const response = await request.get(`/api/v1/rss-feeds?topic=${topicId}`).expect(200)

        expect(Array.isArray(response.body.results)).toBe(true)
        const feed = response.body.results.find(
          (f: { topic: { id: string } }) => f.topic.id === topicId,
        )
        expect(feed).toBeDefined()
        expect(feed.topic_election).toBeUndefined()
        expect(feed.hostname?.votes_score_net).toBeUndefined()
        expect(feed.hostname?.votes_count_up).toBeUndefined()
        expect(feed.hostname?.votes_count_down).toBeUndefined()
        expect(feed.rss_feed_url.hostname.votes_score_net).toBeUndefined()
        expect(feed.rss_feed_url.hostname.votes_count_up).toBeUndefined()
        expect(feed.rss_feed_url.hostname.votes_count_down).toBeUndefined()
        expect(response.body.topic_elections[topicId]).toBeDefined()
        expect(feed.hostname).toBeDefined()
        expect(response.body.hostname_elections[feed.hostname.id]).toBeDefined()
        expect(response.body.hostname_elections[feed.rss_feed_url.hostname.id]).toBeDefined()
        expect(typeof response.body.topic_elections[topicId].id).toBe('string')
        expect(typeof response.body.topic_elections[topicId].votes_score_net).toBe('number')
        expect(typeof response.body.topic_elections[topicId].votes_count_up).toBe('number')
        expect(typeof response.body.topic_elections[topicId].votes_count_down).toBe('number')
        expect(response.body.election_votes).toBeUndefined()
        expect(response.headers['cache-control']).toContain('public')
        expect(response.headers['vary']).toContain('Cookie')
        expect(response.headers['vary']).toContain('Authorization')
      })

      it('authenticated GET with a pre-existing vote includes election_votes keyed by topic id', async () => {
        const voter = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Election Auth Topic ${random}`,
          slug: `election-auth-topic-${random}`,
          createdById: user.id,
        })
        await insertTestRssFeed({
          topicId,
          title: `Election Auth Feed ${random}`,
        })

        await upsertTopicElectionVotes(voter!.id, [{ entityId: topicId, score: 1 }])

        const request = createRequest()
        await request.authenticateAs(voter!)
        const response = await request.get(`/api/v1/rss-feeds?topic=${topicId}`).expect(200)

        expect(response.body.election_votes).toBeDefined()
        expect(response.body.election_votes[topicId]).toBeDefined()
        expect(response.body.election_votes[topicId].choice).toBe('like')
        expect(response.body.election_votes[topicId].entity_id).toBe(topicId)
      })

      it('should return page_info with cursor pagination fields', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Cursor Page Info Topic ${random}`,
          slug: `cursor-page-info-topic-${random}`,
          createdById: user.id,
        })
        await insertTestRssFeed({ topicId, title: `Cursor Feed ${random}` })
        const response = await createRequest().get(`/api/v1/rss-feeds?topic=${topicId}`).expect(200)
        expect(response.body.page_info).toBeDefined()
        expect(typeof response.body.page_info.has_next_page).toBe('boolean')
        expect('end_cursor' in response.body.page_info).toBe(true)
        expect('start_cursor' in response.body.page_info).toBe(true)
      })

      it('should paginate with after cursor across two pages', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        // Each feed requires its own topic (unique constraint on rss_feeds.topic_id)
        const result = await Promise.all(
          [1, 2, 3].map(async n => {
            const topicId = await insertTestTopic({
              name: `Paginate Topic ${n} ${random}`,
              slug: `paginate-topic-${n}-${random}`,
              createdById: user.id,
            })
            const feedId = await insertTestRssFeed({
              topicId,
              title: `Paginate Feed ${n} ${random}`,
              rssFeedUrl: `https://paginate-${n}-${random}.example.com/feed.xml`,
              homePageUrl: `https://paginate-${n}-${random}.example.com/home`,
            })
            return { topicId, feedId }
          }),
        )
        const feedIds = result.map(r => r.feedId)
        const topicsQuery = result.map(r => `topics=${r.topicId}`).join('&')

        const page1 = await createRequest()
          .get(`/api/v1/rss-feeds?${topicsQuery}&limit=2`)
          .expect(200)
        expect(page1.body.results).toHaveLength(2)
        expect(page1.body.page_info.has_next_page).toBe(true)
        expect(typeof page1.body.page_info.end_cursor).toBe('string')

        const page2 = await createRequest()
          .get(`/api/v1/rss-feeds?${topicsQuery}&limit=2&after=${page1.body.page_info.end_cursor}`)
          .expect(200)
        expect(page2.body.results).toHaveLength(1)
        expect(page2.body.page_info.has_next_page).toBe(false)
        expect(page2.body.page_info.end_cursor).toBeNull()

        // Together both pages cover all three feeds (no duplicates, no skips)
        const allIds = [
          ...page1.body.results.map((f: { id: string }) => f.id),
          ...page2.body.results.map((f: { id: string }) => f.id),
        ]
        expect(allIds.sort()).toEqual(feedIds.sort())
      })

      it('should return 400 when after cursor is combined with text_search_query', async () => {
        await createRequest()
          .get('/api/v1/rss-feeds?text_search_query=news&after=dW5rbm93bg==')
          .expect(400)
      })

      it('should return 400 for a malformed after cursor', async () => {
        await createRequest().get('/api/v1/rss-feeds?after=!!!not-valid!!!').expect(400)
      })

      it('should include descendant topic feeds when requested through topics filter', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const parentTopicId = await insertTestTopic({
          name: `Parent Feed Topic ${random}`,
          slug: `parent-feed-topic-${random}`,
          createdById: user.id,
        })
        const childTopicId = await insertTestTopic({
          name: `Child Feed Topic ${random}`,
          slug: `child-feed-topic-${random}`,
          createdById: user.id,
        })
        const metadata = entityRelationMetadatum.find(
          relation =>
            relation.subject_type === 'topic' &&
            relation.object_type === 'topic' &&
            relation.predicate === 'parent',
        )!
        await upsertEntityRelation(user, metadata, { id: childTopicId }, [{ id: parentTopicId }], {
          vote: false,
        })

        const descendantFeedId = await insertTestRssFeed({
          topicId: childTopicId,
          title: `Descendant Feed ${random}`,
          homePageUrl: `https://descendant-${random}.example.com/home`,
          rssFeedUrl: `https://descendant-${random}.example.com/feed.xml`,
        })
        const request = createRequest()
        const response = await request
          .get(
            `/api/v1/rss-feeds?topics=parent-feed-topic-${random}&include_descendants=1&enabled=null`,
          )
          .expect(200)

        const feed = response.body.results.find(
          (item: { id: string }) => item.id === descendantFeedId,
        )
        expect(feed).toBeDefined()
        expect(feed.hostname?.hostname).toBe(`descendant-${random}.example.com`)
        expect(feed.home_page_url?.url).toBe(`https://descendant-${random}.example.com/`)
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof beforeEach)
  void (0 as unknown as typeof afterEach)
})
