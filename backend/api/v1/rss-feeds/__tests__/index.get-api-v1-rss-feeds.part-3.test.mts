import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  insertTestTopic,
  insertTestRssFeed,
  createTestUser,
  insertEntityRelation,
  followRssFeed,
} from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'

describe('index', () => {
  describe('RSS Feeds Routes', () => {
    let user: PrivateUser

    beforeAll(async () => {
      user = await createTestUser()
    })

    describe('GET /api/v1/rss-feeds bookmarks sidecar', () => {
      it('authenticated GET omits bookmarks when user has no bookmarks for the feeds', async () => {
        const reader = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Bookmarks None Topic ${random}`,
          slug: `bookmarks-none-topic-${random}`,
          createdById: user.id,
        })
        await insertTestRssFeed({ topicId, title: `Bookmarks None Feed ${random}` })

        const request = createRequest()
        await request.authenticateAs(reader)
        const response = await request.get(`/api/v1/rss-feeds?topic=${topicId}`).expect(200)

        expect(response.body.bookmarks).toBeUndefined()
      })

      it('authenticated GET includes bookmarks sidecar with follow and subscribe when set', async () => {
        const reader = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Bookmarks Follow Topic ${random}`,
          slug: `bookmarks-follow-topic-${random}`,
          createdById: user.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Bookmarks Follow Feed ${random}`,
          rssFeedUrl: `https://bookmarks-follow-${random}.example.com/feed.xml`,
          homePageUrl: `https://bookmarks-follow-${random}.example.com/home`,
        })
        await followRssFeed(reader, feedId)
        await insertEntityRelation('relation__user__subscribe__rss_feed', reader.id, feedId)

        const request = createRequest()
        await request.authenticateAs(reader)
        const response = await request.get(`/api/v1/rss-feeds?topic=${topicId}`).expect(200)

        expect(response.body.bookmarks).toBeDefined()
        expect(response.body.bookmarks[feedId]).toBeDefined()
        expect(response.body.bookmarks[feedId].follow).toBe(true)
        expect(response.body.bookmarks[feedId].subscribe).toBe(true)
      })

      it('authenticated GET includes topic follow bookmark keyed by topic id', async () => {
        const reader = await createTestUser()
        const random = Math.random()
        const topicId = await insertTestTopic({
          name: `Bookmarks Topic Follow ${random}`,
          slug: `bookmarks-topic-follow-${random}`,
          createdById: user.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Bookmarks Topic Follow Feed ${random}`,
          rssFeedUrl: `https://bookmarks-topic-follow-${random}.example.com/feed.xml`,
          homePageUrl: `https://bookmarks-topic-follow-${random}.example.com/home`,
        })
        await insertEntityRelation('relation__user__follow__topic', reader.id, topicId)

        const request = createRequest()
        await request.authenticateAs(reader)
        const response = await request.get(`/api/v1/rss-feeds?topic=${topicId}`).expect(200)

        expect(response.body.bookmarks).toBeDefined()
        expect(response.body.bookmarks[topicId]).toBeDefined()
        expect(response.body.bookmarks[topicId].follow).toBe(true)
        expect(response.body.bookmarks[feedId]).toBeUndefined()
      })

      it('unauthenticated GET omits bookmarks sidecar entirely', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Bookmarks Anon Topic ${random}`,
          slug: `bookmarks-anon-topic-${random}`,
          createdById: user.id,
        })
        await insertTestRssFeed({ topicId, title: `Bookmarks Anon Feed ${random}` })

        const response = await createRequest().get(`/api/v1/rss-feeds?topic=${topicId}`).expect(200)

        expect(response.body.bookmarks).toBeUndefined()
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof beforeEach)
  void (0 as unknown as typeof afterEach)
})
