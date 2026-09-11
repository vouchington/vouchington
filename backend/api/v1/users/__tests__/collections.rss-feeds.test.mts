import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  insertTestTopic,
  insertTestRssFeed,
  createTestUser,
  followRssFeed,
  safeUsername,
} from '@voucha/test-helpers'

import { upsertTopicElectionVotes } from '@services/elections-votes/topic'
import { bookmarkEntity } from '@services/bookmarks'

import type { PrivateUser } from '@services/users/types'

describe('Users Collections API Routes', () => {
  describe('GET /api/v1/users/:idOrSlug/rss-feeds/:listType', () => {
    let owner: PrivateUser

    beforeAll(async () => {
      owner = await createTestUser({ username: safeUsername('users-rss-feeds-coll-owner') })
    })

    it('returns empty results and sidecars when user follows no feeds', async () => {
      const request = createRequest()
      const response = await request
        .get(`/api/v1/users/${owner.id}/rss-feeds/following`)
        .expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body.topic_elections).toBeDefined()
      expect(response.body.hostname_elections).toBeDefined()
    })

    it('returns results with topic_elections sidecar when user follows feeds (anonymous viewer)', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const user = await createTestUser({ username: safeUsername(`rss-coll-anon-${random}`) })
      const topicId = await insertTestTopic({
        name: `RSS Coll Topic ${random}`,
        slug: `rss-coll-topic-${random}`,
        createdById: user.id,
      })
      const feedId = await insertTestRssFeed({
        topicId,
        title: `RSS Coll Feed ${random}`,
        rssFeedUrl: `https://rss-coll-${random}.example.com/feed.xml`,
        homePageUrl: `https://rss-coll-${random}.example.com/home`,
      })
      await followRssFeed(user, feedId)

      const request = createRequest()
      const response = await request.get(`/api/v1/users/${user.id}/rss-feeds/following`).expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      const feed = response.body.results.find((f: { id: string }) => f.id === feedId)
      expect(feed).toBeDefined()
      expect(response.body.topic_elections).toBeDefined()
      expect(response.body.topic_elections[topicId]).toBeDefined()
      expect(response.body.hostname_elections).toBeDefined()
      expect(response.body.election_votes).toBeUndefined()
    })

    it('returns election_votes sidecar when authenticated viewer has voted', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const user = await createTestUser({ username: safeUsername(`rss-coll-auth-${random}`) })
      const viewer = await createTestUser({
        username: safeUsername(`rss-coll-viewer-${random}`),
      })
      const topicId = await insertTestTopic({
        name: `RSS Coll Auth Topic ${random}`,
        slug: `rss-coll-auth-topic-${random}`,
        createdById: user.id,
      })
      const feedId = await insertTestRssFeed({
        topicId,
        title: `RSS Coll Auth Feed ${random}`,
      })
      await followRssFeed(user, feedId)
      await upsertTopicElectionVotes(viewer.id, [{ entityId: topicId, score: 1 }])

      const request = createRequest()
      await request.authenticateAs(viewer)
      const response = await request.get(`/api/v1/users/${user.id}/rss-feeds/following`).expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      const feed = response.body.results.find((f: { id: string }) => f.id === feedId)
      expect(feed).toBeDefined()
      expect(response.body.election_votes).toBeDefined()
      expect(response.body.election_votes[topicId]).toBeDefined()
      expect(response.body.election_votes[topicId].choice).toBe('like')
    })

    it('returns bookmarks sidecar when authenticated viewer has bookmarked the topic', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const user = await createTestUser({ username: safeUsername(`rss-coll-bkmk-${random}`) })
      const viewer = await createTestUser({
        username: safeUsername(`rss-coll-bkmk-v-${random}`),
      })
      const topicId = await insertTestTopic({
        name: `RSS Coll Bkmk Topic ${random}`,
        slug: `rss-coll-bkmk-topic-${random}`,
        createdById: user.id,
      })
      const feedId = await insertTestRssFeed({
        topicId,
        title: `RSS Coll Bkmk Feed ${random}`,
      })
      await followRssFeed(user, feedId)
      // Viewer follows (bookmarks) the topic so topicBookmarks is non-empty → sidecars.bookmarks assigned
      await bookmarkEntity(viewer, 'topic', { id: topicId }, 'follow')

      const request = createRequest()
      await request.authenticateAs(viewer)
      const response = await request.get(`/api/v1/users/${user.id}/rss-feeds/following`).expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      const feed = response.body.results.find((f: { id: string }) => f.id === feedId)
      expect(feed).toBeDefined()
      expect(response.body.bookmarks).toBeDefined()
      expect(response.body.bookmarks[topicId]).toBeDefined()
    })
  })
})
