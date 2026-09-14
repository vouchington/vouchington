import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityListItem,
  insertTestTopic,
  createRandomString,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

describe('list-items-topics', () => {
  let owner: PrivateUser
  let member: PrivateUser
  let community: Community

  beforeAll(async () => {
    const [ownerUser, memberUser] = await Promise.all([createTestUser(), createTestUser()])
    owner = ownerUser!
    member = memberUser!
    community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id, role: 'member' }),
    ])
  })

  describe('GET /api/v1/communities/:slug/list-items/topics', () => {
    it('returns 200 with empty results for a public community', async () => {
      const random = createRandomString(8)
      const emptyCommunity = await insertTestCommunity({
        createdById: owner.id,
        slug: `list-get-empty-${random}`,
      })

      const request = createRequest()
      const response = await request
        .get(`/api/v1/communities/${emptyCommunity.slug}/list-items/topics`)
        .expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body).toHaveProperty('page_info')
      expect(response.body).toHaveProperty('community_list_items')
      expect(response.body).toHaveProperty('topics')
    })

    it('returns 200 with list items', async () => {
      const random = createRandomString(8)
      const topicId = await insertTestTopic({
        name: `List Test Topic ${random}`,
        slug: `list-test-topic-${random}`,
        createdById: owner.id,
      })
      await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'topic',
        entityId: topicId,
      })

      const request = createRequest()
      const response = await request
        .get(`/api/v1/communities/${community.slug}/list-items/topics`)
        .expect(200)

      const items = response.body.community_list_items as Record<string, { entity_id: string }>
      expect(typeof items).toBe('object')

      const foundEntity = Object.values(items).find(item => item.entity_id === topicId)
      expect(foundEntity).toBeDefined()
      expect(response.body.results.length).toBeGreaterThanOrEqual(1)
    })

    it('returns 404 for private community as non-member', async () => {
      const random = createRandomString(8)
      const privateCommunity = await insertTestCommunity({
        createdById: owner.id,
        slug: `list-private-${random}`,
        visibility: 'private',
      })

      const request = createRequest()
      await request
        .get(`/api/v1/communities/${privateCommunity.slug}/list-items/topics`)
        .expect(404)
    })
  })

  describe('GET /api/v1/communities/:slug/list-items/counts', () => {
    it('returns 200 with counts', async () => {
      const request = createRequest()
      const response = await request
        .get(`/api/v1/communities/${community.slug}/list-items/counts`)
        .expect(200)

      expect(typeof response.body.topic).toBe('number')
      expect(typeof response.body.rss_feed).toBe('number')
      expect(typeof response.body.post).toBe('number')
      expect(typeof response.body.url_hostname).toBe('number')
      expect(typeof response.body.url).toBe('number')
    })

    it('returns 404 for non-existent community', async () => {
      const request = createRequest()
      await request.get('/api/v1/communities/non-existent-slug/list-items/counts').expect(404)
    })
  })

  describe('POST /api/v1/communities/:slug/list-items/topics', () => {
    it('returns 401 without auth', async () => {
      const random = createRandomString(8)
      const topicId = await insertTestTopic({
        name: `Post 401 Topic ${random}`,
        slug: `post-401-topic-${random}`,
        createdById: owner.id,
      })

      const request = createRequest()
      await request
        .post(`/api/v1/communities/${community.slug}/list-items/topics`)
        .set('Content-Type', 'application/json')
        .send({ topic_id: topicId })
        .expect(401)
    })

    it('returns 403 as non-moderator member', async () => {
      const random = createRandomString(8)
      const topicId = await insertTestTopic({
        name: `Post 403 Topic ${random}`,
        slug: `post-403-topic-${random}`,
        createdById: owner.id,
      })

      const request = createRequest()
      await request.authenticateAs(member)

      await request
        .post(`/api/v1/communities/${community.slug}/list-items/topics`)
        .set('Content-Type', 'application/json')
        .send({ topic_id: topicId })
        .expect(403)
    })

    it('returns 201 and creates item as owner', async () => {
      const random = createRandomString(8)
      const topicId = await insertTestTopic({
        name: `Post 201 Topic ${random}`,
        slug: `post-201-topic-${random}`,
        createdById: owner.id,
      })

      const request = createRequest()
      await request.authenticateAs(owner)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/list-items/topics`)
        .set('Content-Type', 'application/json')
        .send({ topic_id: topicId })
        .expect(201)

      expect(response.body.community_list_item).toBeDefined()
      expect(response.body.community_list_item.entity_id).toBe(topicId)
      expect(response.body.community_list_item.item_type).toBe('topic')
    })

    it('returns 201 as moderator', async () => {
      const random = createRandomString(8)
      const moderator = await createTestUser()
      await insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      })
      const topicId = await insertTestTopic({
        name: `Mod Post Topic ${random}`,
        slug: `mod-post-topic-${random}`,
        createdById: owner.id,
      })

      const request = createRequest()
      await request.authenticateAs(moderator)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/list-items/topics`)
        .set('Content-Type', 'application/json')
        .send({ topic_id: topicId })
        .expect(201)

      expect(response.body.community_list_item.entity_id).toBe(topicId)
    })

    it('returns 422 when topic_id is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)

      await request
        .post(`/api/v1/communities/${community.slug}/list-items/topics`)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(422)
    })
  })

  describe('DELETE /api/v1/communities/:slug/list-items/topics/:itemId', () => {
    it('returns 401 without auth', async () => {
      const random = createRandomString(8)
      const topicId = await insertTestTopic({
        name: `Delete 401 Topic ${random}`,
        slug: `delete-401-topic-${random}`,
        createdById: owner.id,
      })
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'topic',
        entityId: topicId,
      })

      const request = createRequest()
      await request
        .delete(`/api/v1/communities/${community.slug}/list-items/topics/${item.id}`)
        .expect(401)
    })

    it('returns 403 as non-moderator member', async () => {
      const random = createRandomString(8)
      const topicId = await insertTestTopic({
        name: `Delete 403 Topic ${random}`,
        slug: `delete-403-topic-${random}`,
        createdById: owner.id,
      })
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'topic',
        entityId: topicId,
      })

      const request = createRequest()
      await request.authenticateAs(member)

      await request
        .delete(`/api/v1/communities/${community.slug}/list-items/topics/${item.id}`)
        .expect(403)
    })

    it('returns 204 as owner', async () => {
      const random = createRandomString(8)
      const topicId = await insertTestTopic({
        name: `Delete 204 Topic ${random}`,
        slug: `delete-204-topic-${random}`,
        createdById: owner.id,
      })
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'topic',
        entityId: topicId,
      })

      const request = createRequest()
      await request.authenticateAs(owner)

      await request
        .delete(`/api/v1/communities/${community.slug}/list-items/topics/${item.id}`)
        .expect(204)
    })
  })
})
