import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityListItem,
  insertTestTopic,
  insertTestRssFeed,
  createRandomString,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { listImportConfig } from '@services/lists/import-config'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

describe('list-items-rss-feeds', () => {
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

  async function createTestFeed(random: string): Promise<string> {
    const rssTopic = await insertTestTopic({
      name: `RSS Item Topic ${random}`,
      slug: `rss-item-topic-${random}`,
      createdById: owner.id,
    })
    return insertTestRssFeed({
      topicId: rssTopic,
      title: `RSS Item Feed ${random}`,
    })
  }

  describe('GET /api/v1/communities/:slug/list-items/rss-feeds', () => {
    it('returns 200 with rss_feeds map', async () => {
      const random = createRandomString(8)
      const rssTopic = await insertTestTopic({
        name: `RSS Route Topic ${random}`,
        slug: `rss-route-topic-${random}`,
        createdById: owner.id,
      })
      const feedId = await insertTestRssFeed({
        topicId: rssTopic,
        title: `RSS Route Feed ${random}`,
      })
      await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'rss_feed',
        entityId: feedId,
      })

      const request = createRequest()
      const response = await request
        .get(`/api/v1/communities/${community.slug}/list-items/rss-feeds`)
        .expect(200)

      expect(response.body).toHaveProperty('rss_feeds')
      expect(Array.isArray(response.body.results)).toBe(true)
    })
  })

  describe('POST /api/v1/communities/:slug/list-items/rss-feeds', () => {
    it('returns 401 without auth', async () => {
      const random = createRandomString(8)
      const feedId = await createTestFeed(`post401${random}`)

      const request = createRequest()
      await request
        .post(`/api/v1/communities/${community.slug}/list-items/rss-feeds`)
        .set('Content-Type', 'application/json')
        .send({ rss_feed_id: feedId })
        .expect(401)
    })

    it('returns 403 as non-moderator member', async () => {
      const random = createRandomString(8)
      const feedId = await createTestFeed(`post403${random}`)

      const request = createRequest()
      await request.authenticateAs(member)

      await request
        .post(`/api/v1/communities/${community.slug}/list-items/rss-feeds`)
        .set('Content-Type', 'application/json')
        .send({ rss_feed_id: feedId })
        .expect(403)
    })

    it('returns 201 and creates item as owner', async () => {
      const random = createRandomString(8)
      const feedId = await createTestFeed(`post201${random}`)

      const request = createRequest()
      await request.authenticateAs(owner)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/list-items/rss-feeds`)
        .set('Content-Type', 'application/json')
        .send({ rss_feed_id: feedId })
        .expect(201)

      expect(response.body.community_list_item).toBeDefined()
      expect(response.body.community_list_item.entity_id).toBe(feedId)
      expect(response.body.community_list_item.item_type).toBe('rss_feed')
    })

    it('returns 201 as moderator', async () => {
      const random = createRandomString(8)
      const moderator = await createTestUser()
      await insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      })
      const feedId = await createTestFeed(`modpost${random}`)

      const request = createRequest()
      await request.authenticateAs(moderator)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/list-items/rss-feeds`)
        .set('Content-Type', 'application/json')
        .send({ rss_feed_id: feedId })
        .expect(201)

      expect(response.body.community_list_item.entity_id).toBe(feedId)
    })

    it('returns 422 when rss_feed_id is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)

      await request
        .post(`/api/v1/communities/${community.slug}/list-items/rss-feeds`)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(422)
    })

    it('returns the configured limit when a third feed is added', async () => {
      const cappedCommunity = await insertTestCommunity({ createdById: owner.id })
      await insertTestCommunityMember({
        communityId: cappedCommunity.id,
        userId: owner.id,
        role: 'owner',
      })
      const feedIds = await Promise.all(
        Array.from({ length: 3 }, () => createTestFeed(createRandomString(8))),
      )
      const restore = overrideDynamicConfigFieldsForTest(listImportConfig, {
        max_community_list_feeds: 2,
      })
      try {
        const request = createRequest()
        await request.authenticateAs(owner)
        for (const feedId of feedIds.slice(0, 2)) {
          await request
            .post(`/api/v1/communities/${cappedCommunity.slug}/list-items/rss-feeds`)
            .send({ rss_feed_id: feedId })
            .expect(201)
        }
        const response = await request
          .post(`/api/v1/communities/${cappedCommunity.slug}/list-items/rss-feeds`)
          .send({ rss_feed_id: feedIds[2] })
          .expect(422)
        expect(response.body).toMatchObject({
          code: 'community_list_feed_limit_reached',
          limit: 2,
        })
      } finally {
        restore()
      }
    })
  })

  describe('DELETE /api/v1/communities/:slug/list-items/rss-feeds/:itemId', () => {
    it('returns 401 without auth', async () => {
      const random = createRandomString(8)
      const feedId = await createTestFeed(`del401${random}`)
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'rss_feed',
        entityId: feedId,
      })

      const request = createRequest()
      await request
        .delete(`/api/v1/communities/${community.slug}/list-items/rss-feeds/${item.id}`)
        .expect(401)
    })

    it('returns 403 as non-moderator member', async () => {
      const random = createRandomString(8)
      const feedId = await createTestFeed(`del403${random}`)
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'rss_feed',
        entityId: feedId,
      })

      const request = createRequest()
      await request.authenticateAs(member)

      await request
        .delete(`/api/v1/communities/${community.slug}/list-items/rss-feeds/${item.id}`)
        .expect(403)
    })

    it('returns 204 as owner', async () => {
      const random = createRandomString(8)
      const feedId = await createTestFeed(`del204${random}`)
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'rss_feed',
        entityId: feedId,
      })

      const request = createRequest()
      await request.authenticateAs(owner)

      await request
        .delete(`/api/v1/communities/${community.slug}/list-items/rss-feeds/${item.id}`)
        .expect(204)
    })
  })
})
