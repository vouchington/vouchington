import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestTopic,
  insertTestRssFeed,
  insertEntityRelation,
  insertTestLocalFollow,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { updateRssFeedById } from '@services/rss-feeds'

describe('recommended-rss-feeds', () => {
  let currentUser: PrivateUser
  let friend: PrivateUser
  let friendFeedId: string

  beforeAll(async () => {
    currentUser = await createTestUser()
    friend = await createTestUser()
    await insertTestLocalFollow(currentUser.id, friend.id)

    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Recommended API Topic ${random}`,
      slug: `recommended-api-topic-${random}`,
      createdById: admin.id,
    })
    friendFeedId = await insertTestRssFeed({
      topicId,
      title: `Recommended API Feed ${random}`,
    })
    // Friend follows the feed so it becomes a recommendation for currentUser
    await insertEntityRelation('relation__user__follow__rss_feed', friend.id, friendFeedId)
  })

  describe('GET /api/v1/rss-feeds/recommended', () => {
    it('returns 401 for unauthenticated users', async () => {
      const request = createRequest()
      await request.get('/api/v1/rss-feeds/recommended').expect(401)
    })

    it('returns 200 with results for authenticated users', async () => {
      const request = createRequest()
      await request.authenticateAs(currentUser)
      const response = await request.get('/api/v1/rss-feeds/recommended').expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body.page_info).toBeDefined()
      expect(response.body.rss_feeds).toBeDefined()
    })

    it('sets private, no-store cache-control header', async () => {
      const request = createRequest()
      await request.authenticateAs(currentUser)
      const response = await request.get('/api/v1/rss-feeds/recommended').expect(200)
      expect(response.headers['cache-control']).toBe('private, no-store')
    })

    it('returns 400 for invalid source', async () => {
      const request = createRequest()
      await request.authenticateAs(currentUser)
      await request.get('/api/v1/rss-feeds/recommended?source=invalid').expect(400)
    })

    it('supports source=friends', async () => {
      const request = createRequest()
      await request.authenticateAs(currentUser)
      const response = await request
        .get('/api/v1/rss-feeds/recommended?source=friends&limit=100')
        .expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('includes friend-followed feed in friends source results', async () => {
      const request = createRequest()
      await request.authenticateAs(currentUser)
      const response = await request
        .get('/api/v1/rss-feeds/recommended?source=friends&limit=100')
        .expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toContain(friendFeedId)
    })

    it('excludes undiscoverable friend-followed feeds', async () => {
      const hiddenUser = await createTestUser()
      const hiddenFriend = await createTestUser()
      await insertTestLocalFollow(hiddenUser.id, hiddenFriend.id)

      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Hidden Recommended Topic ${random}`,
        slug: `hidden-recommended-topic-${random}`,
        createdById: admin.id,
      })
      const hiddenFeedId = await insertTestRssFeed({
        topicId,
        title: `Hidden Recommended Feed ${random}`,
      })
      await updateRssFeedById(hiddenFeedId, { discoverable: false })
      await insertEntityRelation('relation__user__follow__rss_feed', hiddenFriend.id, hiddenFeedId)

      const request = createRequest()
      await request.authenticateAs(hiddenUser)
      const response = await request
        .get('/api/v1/rss-feeds/recommended?source=friends&limit=100')
        .expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).not.toContain(hiddenFeedId)
    })

    it('supports source=topic', async () => {
      const request = createRequest()
      await request.authenticateAs(currentUser)
      const response = await request.get('/api/v1/rss-feeds/recommended?source=topic').expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('supports source=collaborative', async () => {
      const request = createRequest()
      await request.authenticateAs(currentUser)
      const response = await request
        .get('/api/v1/rss-feeds/recommended?source=collaborative')
        .expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('supports source=all', async () => {
      const request = createRequest()
      await request.authenticateAs(currentUser)
      const response = await request.get('/api/v1/rss-feeds/recommended?source=all').expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('returns empty results for user with no social connections', async () => {
      const lonelyUser = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(lonelyUser)
      const response = await request.get('/api/v1/rss-feeds/recommended?source=friends').expect(200)

      expect(response.body.results).toHaveLength(0)
      expect(response.body.page_info.has_next_page).toBe(false)
    })

    it('does not recommend feeds the user already follows', async () => {
      const selfFollowUser = await createTestUser()
      const selfFriend = await createTestUser()
      await insertTestLocalFollow(selfFollowUser.id, selfFriend.id)

      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Self Follow Topic ${random}`,
        slug: `self-follow-topic-${random}`,
        createdById: admin.id,
      })
      const alreadyFollowedFeedId = await insertTestRssFeed({
        topicId,
        title: `Already Followed Feed ${random}`,
      })

      // Both the user and their friend follow this feed
      await insertEntityRelation(
        'relation__user__follow__rss_feed',
        selfFriend.id,
        alreadyFollowedFeedId,
      )
      await insertEntityRelation(
        'relation__user__follow__rss_feed',
        selfFollowUser.id,
        alreadyFollowedFeedId,
      )

      const request = createRequest()
      await request.authenticateAs(selfFollowUser)
      const response = await request
        .get('/api/v1/rss-feeds/recommended?source=friends&limit=100')
        .expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).not.toContain(alreadyFollowedFeedId)
    })
  })
})
