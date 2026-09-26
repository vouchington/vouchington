import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityListItem,
  insertTestUrlHostname,
  insertTestUrl,
  createRandomString,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

describe('list-items-urls', () => {
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

  async function createTestUrlWithHostname(random: string): Promise<string> {
    const hostnameId = await insertTestUrlHostname({ hostname: `url-item-${random}.example.com` })
    return insertTestUrl({ url: `https://url-item-${random}.example.com/page`, hostnameId })
  }

  describe('POST /api/v1/communities/:slug/list-items/urls', () => {
    it('returns 401 without auth', async () => {
      const random = createRandomString(8)
      const urlId = await createTestUrlWithHostname(`post401${random}`)

      const request = createRequest()
      await request
        .post(`/api/v1/communities/${community.slug}/list-items/urls`)
        .set('Content-Type', 'application/json')
        .send({ url_id: urlId })
        .expect(401)
    })

    it('returns 403 as non-moderator member', async () => {
      const random = createRandomString(8)
      const urlId = await createTestUrlWithHostname(`post403${random}`)

      const request = createRequest()
      await request.authenticateAs(member)

      await request
        .post(`/api/v1/communities/${community.slug}/list-items/urls`)
        .set('Content-Type', 'application/json')
        .send({ url_id: urlId })
        .expect(403)
    })

    it('returns 201 and creates item as owner', async () => {
      const random = createRandomString(8)
      const urlId = await createTestUrlWithHostname(`post201${random}`)

      const request = createRequest()
      await request.authenticateAs(owner)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/list-items/urls`)
        .set('Content-Type', 'application/json')
        .send({ url_id: urlId })
        .expect(201)

      expect(response.body.community_list_item).toBeDefined()
      expect(response.body.community_list_item.entity_id).toBe(urlId)
      expect(response.body.community_list_item.item_type).toBe('url')
    })

    it('returns 201 as moderator', async () => {
      const random = createRandomString(8)
      const moderator = await createTestUser()
      await insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      })
      const urlId = await createTestUrlWithHostname(`modpost${random}`)

      const request = createRequest()
      await request.authenticateAs(moderator)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/list-items/urls`)
        .set('Content-Type', 'application/json')
        .send({ url_id: urlId })
        .expect(201)

      expect(response.body.community_list_item.entity_id).toBe(urlId)
    })

    it('returns 422 when url_id is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(owner)

      await request
        .post(`/api/v1/communities/${community.slug}/list-items/urls`)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(422)
    })
  })

  describe('DELETE /api/v1/communities/:slug/list-items/urls/:itemId', () => {
    it('returns 401 without auth', async () => {
      const random = createRandomString(8)
      const urlId = await createTestUrlWithHostname(`del401${random}`)
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'url',
        entityId: urlId,
      })

      const request = createRequest()
      await request
        .delete(`/api/v1/communities/${community.slug}/list-items/urls/${item.id}`)
        .expect(401)
    })

    it('returns 403 as non-moderator member', async () => {
      const random = createRandomString(8)
      const urlId = await createTestUrlWithHostname(`del403${random}`)
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'url',
        entityId: urlId,
      })

      const request = createRequest()
      await request.authenticateAs(member)

      await request
        .delete(`/api/v1/communities/${community.slug}/list-items/urls/${item.id}`)
        .expect(403)
    })

    it('returns 204 as owner', async () => {
      const random = createRandomString(8)
      const urlId = await createTestUrlWithHostname(`del204${random}`)
      const item = await insertTestCommunityListItem({
        communityId: community.id,
        itemType: 'url',
        entityId: urlId,
      })

      const request = createRequest()
      await request.authenticateAs(owner)

      await request
        .delete(`/api/v1/communities/${community.slug}/list-items/urls/${item.id}`)
        .expect(204)
    })
  })
})
