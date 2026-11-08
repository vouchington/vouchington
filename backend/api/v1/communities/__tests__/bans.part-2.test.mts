import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityBan,
  createRandomString,
} from '@voucha/test-helpers'

describe('Community Ban Routes (read + lift)', () => {
  describe('GET /api/v1/communities/:slug/bans', () => {
    it('returns 401 without auth', async () => {
      const owner = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `ban-get-401-${random}`,
      })

      const request = createRequest()
      await request.get(`/api/v1/communities/${community.slug}/bans`).expect(401)
    })

    it('returns 403 for regular member', async () => {
      const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ban-get-403-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: community.id, userId: member!.id }),
      ])

      const request = createRequest()
      await request.authenticateAs(member!)
      await request.get(`/api/v1/communities/${community.slug}/bans`).expect(403)
    })

    it('owner gets ban list with page_info and users sidecar', async () => {
      const [owner, bannedUser] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ban-get-ok-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner!.id,
        role: 'owner',
      })
      await insertTestCommunityBan({
        communityId: community.id,
        userId: bannedUser!.id,
        bannedById: owner!.id,
      })

      const request = createRequest()
      await request.authenticateAs(owner!)
      const response = await request.get(`/api/v1/communities/${community.slug}/bans`).expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body).toHaveProperty('page_info')
      expect(response.body).toHaveProperty('community_bans')
      expect(response.body).toHaveProperty('users')
    })
  })

  describe('DELETE /api/v1/communities/:slug/bans/:banId', () => {
    it('returns 401 without auth', async () => {
      const owner = await createTestUser()
      const target = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `ban-del-401-${random}`,
      })

      const request = createRequest()
      await request.delete(`/api/v1/communities/${community.slug}/bans/${target.id}`).expect(401)
    })

    it('owner lifts only the selected ban', async () => {
      const [owner, target] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ban-del-ok-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner!.id,
        role: 'owner',
      })
      const ban = await insertTestCommunityBan({
        communityId: community.id,
        userId: target!.id,
        bannedById: owner!.id,
      })

      const sibling = await insertTestCommunityBan({
        communityId: community.id,
        userId: target!.id,
        bannedById: owner!.id,
      })
      const request = createRequest()
      await request.authenticateAs(owner!)
      const response = await request
        .delete(`/api/v1/communities/${community.slug}/bans/${ban.id}`)
        .expect(200)
      expect(response.body).toMatchObject({
        community_id: community.id,
        user_id: target!.id,
        lifted_ban_ids: [ban.id],
      })
      const active = await request
        .get(`/api/v1/communities/${community.slug}/bans/users/${target!.id}`)
        .expect(200)
      expect(active.body.results).toEqual([{ __entity_type: 'community_ban', id: sibling.id }])
      expect(active.body.community_bans[sibling.id]).not.toHaveProperty('reason')
      const detail = await request
        .get(`/api/v1/communities/${community.slug}/bans/${sibling.id}`)
        .expect(200)
      expect(detail.body.community_ban.id).toBe(sibling.id)
      expect(detail.body.community_ban).toHaveProperty('reason')
      const liftedAll = await request
        .delete(`/api/v1/communities/${community.slug}/bans/users/${target!.id}`)
        .expect(200)
      expect(liftedAll.body.lifted_ban_ids).toEqual([sibling.id])
    })

    it('returns 403 for regular member', async () => {
      const [owner, member, target] = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ban-del-403-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: community.id, userId: member!.id }),
      ])
      await insertTestCommunityBan({
        communityId: community.id,
        userId: target!.id,
        bannedById: owner!.id,
      })

      const request = createRequest()
      await request.authenticateAs(member!)
      await request.delete(`/api/v1/communities/${community.slug}/bans/${target!.id}`).expect(403)
    })

    it('returns 404 if no active ban', async () => {
      const [owner, target] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ban-del-404-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner!.id,
        role: 'owner',
      })

      const request = createRequest()
      await request.authenticateAs(owner!)
      await request.delete(`/api/v1/communities/${community.slug}/bans/${target!.id}`).expect(404)
    })
  })
})
