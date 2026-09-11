import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestRssFeedItemWithUrl,
  insertTestTopic,
  insertTestRssFeed,
  createTestUser,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('bookmarks', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('Bookmarks API', () => {
    describe('GET /api/v1/bookmarks/:entityType/:entityId', () => {
      it('should return 401 for unauthenticated requests', async () => {
        const topicId = await insertTestTopic({
          name: `Bookmark Unauth Topic ${crypto.randomUUID().slice(0, 8)}`,
          slug: `bookmark-unauth-${crypto.randomUUID().slice(0, 8)}`,
          createdById: user.id,
        })
        const request = createRequest()
        await request.get(`/api/v1/bookmarks/topic/${topicId}`).expect(401)
      })

      it('should return empty bookmarks for topic with no follows', async () => {
        const topicId = await insertTestTopic({
          name: `Bookmark Empty Topic ${crypto.randomUUID().slice(0, 8)}`,
          slug: `bookmark-empty-${crypto.randomUUID().slice(0, 8)}`,
          createdById: user.id,
        })
        const request = createRequest()
        await request.authenticateAs(user)
        const response = await request.get(`/api/v1/bookmarks/topic/${topicId}`).expect(200)

        expect(response.body).toEqual({ bookmarks: {} })
      })

      it('should return 422 for invalid entity type', async () => {
        const request = createRequest()
        await request.authenticateAs(user)
        await request.get('/api/v1/bookmarks/invalid_entity_type/some-id').expect(422)
      })

      it('should return 422 for malformed RSS feed item ID', async () => {
        const request = createRequest()
        await request.authenticateAs(user)
        // RSS feed item ID must be in format "feed_id:guid", missing guid should error
        await request.get('/api/v1/bookmarks/rss_feed_item/feed-id-without-colon').expect(422)
      })
    })

    describe('PUT /api/v1/bookmarks/:entityType/:entityId/:predicate', () => {
      it('should return 401 for unauthenticated requests', async () => {
        const request = createRequest()
        await request
          .put('/api/v1/bookmarks/topic/00000000-0000-0000-0000-000000000000/follow')
          .expect(401)
      })

      it('should follow a topic', async () => {
        const topicId = await insertTestTopic({
          name: `Follow Topic ${crypto.randomUUID().slice(0, 8)}`,
          slug: `follow-topic-${crypto.randomUUID().slice(0, 8)}`,
          createdById: user.id,
        })
        const request = createRequest()
        await request.authenticateAs(user)
        const response = await request.put(`/api/v1/bookmarks/topic/${topicId}/follow`).expect(200)

        expect(response.body).toBeDefined()

        // Verify bookmark is now set
        const getResponse = await request.get(`/api/v1/bookmarks/topic/${topicId}`).expect(200)
        expect(getResponse.body.bookmarks.follow).toBe(true)
      })

      it('should follow an RSS feed', async () => {
        const topicId = await insertTestTopic({
          name: `Feed Follow Topic ${crypto.randomUUID().slice(0, 8)}`,
          slug: `feed-follow-topic-${crypto.randomUUID().slice(0, 8)}`,
          createdById: user.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Feed Follow ${crypto.randomUUID().slice(0, 8)}`,
        })
        const request = createRequest()
        await request.authenticateAs(user)
        await request.put(`/api/v1/bookmarks/rss_feed/${feedId}/follow`).expect(200)

        const getResponse = await request.get(`/api/v1/bookmarks/rss_feed/${feedId}`).expect(200)
        expect(getResponse.body.bookmarks.follow).toBe(true)
      })

      it('should save and unsave an RSS feed item', async () => {
        const topicId = await insertTestTopic({
          name: `Save Item Topic ${crypto.randomUUID().slice(0, 8)}`,
          slug: `save-item-topic-${crypto.randomUUID().slice(0, 8)}`,
          createdById: user.id,
        })
        const feedId = await insertTestRssFeed({
          topicId,
          title: `Save Feed ${crypto.randomUUID().slice(0, 8)}`,
        })
        const { id: itemId } = await createTestRssFeedItemWithUrl(feedId)
        const request = createRequest()
        await request.authenticateAs(user)

        await request.put(`/api/v1/bookmarks/rss_feed_item/${itemId}/save`).expect(200)
        const getResponse = await request
          .get(`/api/v1/bookmarks/rss_feed_item/${itemId}`)
          .expect(200)
        expect(getResponse.body.bookmarks.save).toBe(true)

        await request.delete(`/api/v1/bookmarks/rss_feed_item/${itemId}/save`).expect(204)
        const afterDelete = await request
          .get(`/api/v1/bookmarks/rss_feed_item/${itemId}`)
          .expect(200)
        expect(afterDelete.body.bookmarks.save).toBeUndefined()
      })

      it('should return 422 for invalid bookmark predicate', async () => {
        const topicId = await insertTestTopic({
          name: `Invalid Pred Topic ${crypto.randomUUID().slice(0, 8)}`,
          slug: `invalid-pred-topic-${crypto.randomUUID().slice(0, 8)}`,
          createdById: user.id,
        })
        const request = createRequest()
        await request.authenticateAs(user)
        await request.put(`/api/v1/bookmarks/topic/${topicId}/invalid_predicate`).expect(422)
      })

      it('should be idempotent (PUT twice has same result)', async () => {
        const topicId = await insertTestTopic({
          name: `Idempotent Topic ${crypto.randomUUID().slice(0, 8)}`,
          slug: `idempotent-topic-${crypto.randomUUID().slice(0, 8)}`,
          createdById: user.id,
        })
        const request = createRequest()
        await request.authenticateAs(user)
        await request.put(`/api/v1/bookmarks/topic/${topicId}/follow`).expect(200)
        await request.put(`/api/v1/bookmarks/topic/${topicId}/follow`).expect(200)

        const getResponse = await request.get(`/api/v1/bookmarks/topic/${topicId}`).expect(200)
        expect(getResponse.body.bookmarks.follow).toBe(true)
      })

      it('should return 404 for non-existent RSS feed item UUID in PUT', async () => {
        const request = createRequest()
        await request.authenticateAs(user)

        const validUuid = crypto.randomUUID()
        await request.put(`/api/v1/bookmarks/rss_feed_item/${validUuid}/save`).expect(404)
      })

      it('should return 422 for invalid RSS feed item UUID in PUT', async () => {
        const request = createRequest()
        await request.authenticateAs(user)
        await request.put('/api/v1/bookmarks/rss_feed_item/not-a-valid-uuid/save').expect(422)
      })
    })

    describe('DELETE /api/v1/bookmarks/:entityType/:entityId/:predicate', () => {
      it('should return 401 for unauthenticated requests', async () => {
        const request = createRequest()
        await request
          .delete('/api/v1/bookmarks/topic/00000000-0000-0000-0000-000000000000/follow')
          .expect(401)
      })

      it('should unfollow a topic', async () => {
        const topicId = await insertTestTopic({
          name: `Unfollow Topic ${crypto.randomUUID().slice(0, 8)}`,
          slug: `unfollow-topic-${crypto.randomUUID().slice(0, 8)}`,
          createdById: user.id,
        })
        const request = createRequest()
        await request.authenticateAs(user)

        // First follow
        await request.put(`/api/v1/bookmarks/topic/${topicId}/follow`).expect(200)

        // Verify followed
        let getResponse = await request.get(`/api/v1/bookmarks/topic/${topicId}`).expect(200)
        expect(getResponse.body.bookmarks.follow).toBe(true)

        // Now unfollow
        await request.delete(`/api/v1/bookmarks/topic/${topicId}/follow`).expect(204)

        // Verify unfollowed
        getResponse = await request.get(`/api/v1/bookmarks/topic/${topicId}`).expect(200)
        expect(getResponse.body.bookmarks.follow).toBeUndefined()
      })

      it('should be idempotent (DELETE twice has same result)', async () => {
        const topicId = await insertTestTopic({
          name: `Idempotent Delete Topic ${crypto.randomUUID().slice(0, 8)}`,
          slug: `idempotent-delete-topic-${crypto.randomUUID().slice(0, 8)}`,
          createdById: user.id,
        })
        const request = createRequest()
        await request.authenticateAs(user)

        // Follow first
        await request.put(`/api/v1/bookmarks/topic/${topicId}/follow`).expect(200)

        // Delete twice
        await request.delete(`/api/v1/bookmarks/topic/${topicId}/follow`).expect(204)
        await request.delete(`/api/v1/bookmarks/topic/${topicId}/follow`).expect(204)

        // Verify unfollowed
        const getResponse = await request.get(`/api/v1/bookmarks/topic/${topicId}`).expect(200)
        expect(getResponse.body.bookmarks.follow).toBeUndefined()
      })

      it('should return 422 for invalid RSS feed item UUID in DELETE', async () => {
        const request = createRequest()
        await request.authenticateAs(user)
        await request.delete('/api/v1/bookmarks/rss_feed_item/not-a-valid-uuid/save').expect(422)
      })
    })

    describe('user entity bookmarks', () => {
      let targetUser: PrivateUser

      beforeAll(async () => {
        targetUser = await createTestUser()
      })

      it('should return 401 for unauthenticated follow', async () => {
        const request = createRequest()
        await request.put(`/api/v1/bookmarks/user/${targetUser.id}/follow`).expect(401)
      })

      it('should follow a user', async () => {
        const request = createRequest()
        await request.authenticateAs(user)
        await request.put(`/api/v1/bookmarks/user/${targetUser.id}/follow`).expect(200)

        const getResponse = await request.get(`/api/v1/bookmarks/user/${targetUser.id}`).expect(200)
        expect(getResponse.body.bookmarks.follow).toBe(true)
      })

      it('should dismiss a user recommendation', async () => {
        const request = createRequest()
        await request.authenticateAs(user)
        await request
          .put(`/api/v1/bookmarks/user/${targetUser.id}/dismiss_recommendation`)
          .expect(200)

        const getResponse = await request.get(`/api/v1/bookmarks/user/${targetUser.id}`).expect(200)
        expect(getResponse.body.bookmarks.dismiss_recommendation).toBe(true)
      })

      it('should mute a user', async () => {
        const request = createRequest()
        await request.authenticateAs(user)
        await request.put(`/api/v1/bookmarks/user/${targetUser.id}/mute`).expect(200)

        const getResponse = await request.get(`/api/v1/bookmarks/user/${targetUser.id}`).expect(200)
        expect(getResponse.body.bookmarks.mute).toBe(true)
      })

      it('should unfollow a user', async () => {
        const freshTarget = await createTestUser()
        const request = createRequest()
        await request.authenticateAs(user)

        await request.put(`/api/v1/bookmarks/user/${freshTarget.id}/follow`).expect(200)

        let getResponse = await request.get(`/api/v1/bookmarks/user/${freshTarget.id}`).expect(200)
        expect(getResponse.body.bookmarks.follow).toBe(true)

        await request.delete(`/api/v1/bookmarks/user/${freshTarget.id}/follow`).expect(204)

        getResponse = await request.get(`/api/v1/bookmarks/user/${freshTarget.id}`).expect(200)
        expect(getResponse.body.bookmarks.follow).toBeUndefined()
      })

      it('should return 422 for invalid user UUID', async () => {
        const request = createRequest()
        await request.authenticateAs(user)
        await request.put('/api/v1/bookmarks/user/not-a-uuid/follow').expect(422)
      })
    })
  })
})
