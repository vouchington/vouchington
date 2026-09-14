import { describe, it, expect, beforeAll } from 'vitest'
import { encodeCursor } from '@modules/pagination'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  insertTestTopic,
  insertTestRssFeed,
  createTestUser,
  addRssFeedTopicPublisherType,
  insertEntityRelation,
  createTestMembership,
  updateTestMembershipExpiresAt,
  insertTestRssFeedCrawl,
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
      it('should return 400 for an after cursor with a non-UUID id', async () => {
        const cursor = encodeCursor({ id: 'not-a-uuid' })

        await createRequest()
          .get(`/api/v1/rss-feeds?after=${encodeURIComponent(cursor)}`)
          .expect(400)
      })

      it('should return 400 with the route cursor message for a malformed after cursor', async () => {
        const response = await createRequest()
          .get('/api/v1/rss-feeds?after=completely-malformed-base64-or-json')
          .expect(400)

        expect(response.body.message).toBe('Invalid cursor')
      })
    })

    describe('GET /api/v1/rss-feeds/:id/crawls', () => {
      it('should return 401 for unauthenticated requests', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Crawls Unauth Topic ${random}`,
          slug: `crawls-unauth-topic-${random}`,
          createdById: user.id,
        })
        const feedId = await insertTestRssFeed({ topicId, title: `Crawls Unauth Feed ${random}` })
        const request = createRequest()
        await request.get(`/api/v1/rss-feeds/${feedId}/crawls`).expect(401)
      })

      it.each([
        ['free', null],
        ['paused', 'paused'],
        ['cancelled', 'cancelled'],
        ['expired', 'expired'],
      ])('returns 403 for %s users', async (_, status) => {
        const lifecycleUser = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Crawls NonAdmin Topic ${random}`,
          slug: `crawls-non-admin-topic-${random}`,
          createdById: lifecycleUser.id,
        })
        const feedId = await insertTestRssFeed({ topicId, title: `Crawls NonAdmin Feed ${random}` })
        const request = createRequest()
        await request.authenticateAs(lifecycleUser)
        if (status)
          await createTestMembership({
            user_id: lifecycleUser.id,
            plan: 'plus',
            status: status as never,
          })
        await request.get(`/api/v1/rss-feeds/${feedId}/crawls`).expect(403)
      })

      it('returns 403 after a finite paid grant expires', async () => {
        const elapsedUser = await createTestUser()
        const membership = await createTestMembership({ user_id: elapsedUser.id, plan: 'plus' })
        await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 1_000))
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Elapsed Crawl Topic ${random}`,
          slug: `elapsed-crawl-topic-${random}`,
          createdById: elapsedUser.id,
        })
        const feedId = await insertTestRssFeed({ topicId, title: `Elapsed Crawl Feed ${random}` })
        const request = createRequest()
        await request.authenticateAs(elapsedUser)

        await request.get(`/api/v1/rss-feeds/${feedId}/crawls`).expect(403)
      })

      it.each([
        ['plus', 'active'],
        ['plus', 'past_due'],
        ['pro', 'active'],
        ['pro', 'past_due'],
      ])('returns redacted crawl history for %s %s users', async (plan, status) => {
        const paidUser = await createTestUser()
        await createTestMembership({
          user_id: paidUser.id,
          plan: plan as never,
          status: status as never,
        })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Paid Crawl Topic ${random}`,
          slug: `paid-crawl-topic-${random}`,
          createdById: paidUser.id,
        })
        const feedId = await insertTestRssFeed({ topicId, title: `Paid Crawl Feed ${random}` })
        const crawlId = await insertTestRssFeedCrawl({
          rssFeedId: feedId,
          responseCode: 200,
        })
        const request = createRequest()
        await request.authenticateAs(paidUser)
        const response = await request.get(`/api/v1/rss-feeds/${feedId}/crawls?limit=1`).expect(200)

        expect(response.body.results).toEqual([
          expect.objectContaining({ id: crawlId, response_code: 200 }),
        ])
        expect(response.body.results[0]).not.toHaveProperty('feed_data')
        expect(response.body.results[0]).not.toHaveProperty('feed_data_sha256')
        expect(response.body.page_info).toEqual(expect.any(Object))
      })

      it('rejects a cursor issued for another feed', async () => {
        const paidUser = await createTestUser()
        await createTestMembership({ user_id: paidUser.id, plan: 'plus', status: 'active' })
        const random = Math.random().toString(36).slice(2, 8)
        const [firstTopicId, secondTopicId] = await Promise.all([
          insertTestTopic({
            name: `First Scoped Crawl Topic ${random}`,
            slug: `first-scoped-crawl-topic-${random}`,
            createdById: paidUser.id,
          }),
          insertTestTopic({
            name: `Second Scoped Crawl Topic ${random}`,
            slug: `second-scoped-crawl-topic-${random}`,
            createdById: paidUser.id,
          }),
        ])
        const [firstFeedId, secondFeedId] = await Promise.all([
          insertTestRssFeed({
            topicId: firstTopicId,
            title: `First Scoped Crawl Feed ${random}`,
          }),
          insertTestRssFeed({
            topicId: secondTopicId,
            title: `Second Scoped Crawl Feed ${random}`,
          }),
        ])
        await Promise.all([
          insertTestRssFeedCrawl({ rssFeedId: firstFeedId, responseCode: 200 }),
          insertTestRssFeedCrawl({ rssFeedId: firstFeedId, responseCode: 200 }),
        ])

        const request = createRequest()
        await request.authenticateAs(paidUser)
        const firstPage = await request
          .get(`/api/v1/rss-feeds/${firstFeedId}/crawls?limit=1`)
          .expect(200)
        const cursor = firstPage.body.page_info.end_cursor
        expect(cursor).toEqual(expect.any(String))

        await request
          .get(`/api/v1/rss-feeds/${secondFeedId}/crawls?after=${encodeURIComponent(cursor)}`)
          .expect(400)
      })

      it('should return 400 for a malformed after cursor', async () => {
        const paidUser = await createTestUser()
        await createTestMembership({ user_id: paidUser.id, plan: 'plus', status: 'active' })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Malformed Crawl Cursor Topic ${random}`,
          slug: `malformed-crawl-cursor-topic-${random}`,
          createdById: paidUser.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Malformed Crawl Cursor Feed ${random}`,
        })
        const request = createRequest()
        await request.authenticateAs(paidUser)
        const response = await request
          .get(`/api/v1/rss-feeds/${feedId}/crawls?after=completely-malformed-base64-or-json`)
          .expect(400)

        expect(response.body.message).toBe('Invalid RSS feed crawl cursor')
      })

      it('pages through a feed crawl history with no duplicate or missing rows', async () => {
        const paidUser = await createTestUser()
        await createTestMembership({ user_id: paidUser.id, plan: 'plus', status: 'active' })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Paged Crawl Topic ${random}`,
          slug: `paged-crawl-topic-${random}`,
          createdById: paidUser.id,
        })
        const feedId = await insertTestRssFeed({ topicId, title: `Paged Crawl Feed ${random}` })

        const crawlIds = [
          await insertTestRssFeedCrawl({ rssFeedId: feedId, responseCode: 200 }),
          await insertTestRssFeedCrawl({ rssFeedId: feedId, responseCode: 200 }),
          await insertTestRssFeedCrawl({ rssFeedId: feedId, responseCode: 200 }),
        ]

        const request = createRequest()
        await request.authenticateAs(paidUser)

        const page1 = await request.get(`/api/v1/rss-feeds/${feedId}/crawls?limit=2`).expect(200)
        expect(page1.body.results).toHaveLength(2)
        expect(page1.body.page_info.has_next_page).toBe(true)
        expect(typeof page1.body.page_info.end_cursor).toBe('string')

        const page2 = await request
          .get(
            `/api/v1/rss-feeds/${feedId}/crawls?limit=2&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
          )
          .expect(200)
        expect(page2.body.results).toHaveLength(1)
        expect(page2.body.page_info.has_next_page).toBe(false)
        expect(page2.body.page_info.end_cursor).toBeNull()

        const seenIds: string[] = [...page1.body.results, ...page2.body.results].map(
          (crawl: { id: string }) => crawl.id,
        )
        expect(new Set(seenIds).size).toBe(seenIds.length)
        expect(seenIds.toSorted()).toEqual(crawlIds.toSorted())
      })

      it('should return 404 for unknown feed id', async () => {
        const admin = await createTestUser({ administrator: true })
        const request = createRequest()
        await request.authenticateAs(admin!)
        await request
          .get('/api/v1/rss-feeds/00000000-0000-0000-0000-000000000000/crawls')
          .expect(404)
      })

      it('should return crawls array for admin', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Crawls Admin Topic ${random}`,
          slug: `crawls-admin-topic-${random}`,
          createdById: admin!.id,
        })
        const feedId = await insertTestRssFeed({ topicId, title: `Crawls Admin Feed ${random}` })
        const request = createRequest()
        await request.authenticateAs(admin!)
        const response = await request.get(`/api/v1/rss-feeds/${feedId}/crawls`).expect(200)

        expect(Array.isArray(response.body.results)).toBe(true)
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof addRssFeedTopicPublisherType)
  void (0 as unknown as typeof insertEntityRelation)
  void (0 as unknown as typeof createTopicAliases)
  void (0 as unknown as typeof upsertEntityRelation)
  void (0 as unknown as typeof entityRelationMetadatum)
  void (0 as unknown as typeof HTTP_CACHE_SHORT_MAX_AGE_SECONDS)
  void (0 as unknown as typeof upsertTopicElectionVotes)
})
