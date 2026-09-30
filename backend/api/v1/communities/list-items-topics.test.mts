import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { describeCommunityListItemRoutes } from '@voucha/test-helpers/community-list-item-routes'
import {
  createRandomString,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestTopic,
} from '@voucha/test-helpers'

describeCommunityListItemRoutes({
  segment: 'topics',
  itemType: 'topic',
  bodyKey: 'topic_id',
  createEntityId: (random, ownerId) =>
    insertTestTopic({
      name: `List topic ${random}`,
      slug: `list-topic-${random}`,
      createdById: ownerId,
    }),
  registerAdditional(context) {
    describe('GET /api/v1/communities/:slug/list-items/topics', () => {
      it('returns 200 with empty results for a public community', async () => {
        const { owner } = context()
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
        const { owner, community } = context()
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
        const { owner } = context()
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
        const { community } = context()
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
  },
})
