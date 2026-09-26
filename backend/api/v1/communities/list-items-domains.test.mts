import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityListItem,
  insertTestUrlHostname,
  createRandomString,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

describe('list-items-domains', () => {
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

  describe('POST /api/v1/communities/:slug/list-items/domains', () => {
    it('returns 401 without auth', async () => {
      const random = createRandomString(8)
      const hostnameId = await insertTestUrlHostname({ hostname: `post-401-${random}.example.com` })

      const request = createRequest()
      await request
        .post(`/api/v1/communities/${community.slug}/list-items/domains`)
        .set('Content-Type', 'application/json')
        .send({ url_hostname_id: hostnameId })
        .expect(401)
    })

    it('returns 403 as non-moderator member', async () => {
      const random = createRandomString(8)
      const hostnameId = await insertTestUrlHostname({ hostname: `post-403-${random}.example.com` })

      const request = createRequest()
      await request.authenticateAs(member)

      await request
        .post(`/api/v1/communities/${community.slug}/list-items/domains`)
        .set('Content-Type', 'application/json')
        .send({ url_hostname_id: hostnameId })
        .expect(403)
    })

    it('returns 201 and creates item as owner', async () => {
      const random = createRandomString(8)
      const hostnameId = await insertTestUrlHostname({ hostname: `post-201-${random}.example.com` })

      const request = createRequest()
      await request.authenticateAs(owner)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/list-items/domains`)
        .set('Content-Type', 'application/json')
        .send({ url_hostname_id: hostnameId })
        .expect(201)

      expect(response.body.community_list_item).toBeDefined()
      expect(response.body.community_list_item.entity_id).toBe(hostnameId)
      expect(response.body.community_list_item.item_type).toBe('url_hostname')
    })

    it('returns 201 as moderator', async () => {
      const random = createRandomString(8)
      const moderator = await createTestUser()
      await insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      })
      const hostnameId = await insertTestUrlHostname({ hostname: `mod-post-${random}.example.com` })

      const request = createRequest()
      await request.authenticateAs(moderator)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/list-items/domains`)
        .set('Content-Type', 'application/json')
        .send({ url_hostname_id: hostnameId })
        .expect(201)

      expect(response.body.community_list_item.entity_id).toBe(hostnameId)
    })

    it('returns 422 when url_hostname_id is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)

      await request
        .post(`/api/v1/communities/${community.slug}/list-items/domains`)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(422)
    })
  })

  describe('DELETE /api/v1/communities/:slug/list-items/domains/:itemId', () => {
    it('returns 401 without auth', async () => {
      const random = createRandomString(8)
      const hostnameId = await insertTestUrlHostname({
        hostname: `delete-401-${random}.example.com`,
      })
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'url_hostname',
        entityId: hostnameId,
      })

      const request = createRequest()
      await request
        .delete(`/api/v1/communities/${community.slug}/list-items/domains/${item.id}`)
        .expect(401)
    })

    it('returns 403 as non-moderator member', async () => {
      const random = createRandomString(8)
      const hostnameId = await insertTestUrlHostname({
        hostname: `delete-403-${random}.example.com`,
      })
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'url_hostname',
        entityId: hostnameId,
      })

      const request = createRequest()
      await request.authenticateAs(member)

      await request
        .delete(`/api/v1/communities/${community.slug}/list-items/domains/${item.id}`)
        .expect(403)
    })

    it('returns 204 as owner', async () => {
      const random = createRandomString(8)
      const hostnameId = await insertTestUrlHostname({
        hostname: `delete-204-${random}.example.com`,
      })
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'url_hostname',
        entityId: hostnameId,
      })

      const request = createRequest()
      await request.authenticateAs(owner)

      await request
        .delete(`/api/v1/communities/${community.slug}/list-items/domains/${item.id}`)
        .expect(204)
    })
  })
})
