import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  createTestMembership,
  insertTestCommunity,
  insertTestCommunityMember,
  createRandomString,
} from '@voucha/test-helpers'

describe('Community Members Routes', () => {
  describe('GET /api/v1/communities/:slug/members', () => {
    it('returns member list', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `members-get-${random}`,
      })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })

      const request = createRequest()
      const response = await request
        .get(`/api/v1/communities/${community.slug}/members`)
        .expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body).toHaveProperty('page_info')
      expect(response.body).toHaveProperty('community_members')
    })
  })

  describe('POST /api/v1/communities/:slug/members', () => {
    it('returns 401 without auth', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `members-join-401-${random}`,
      })

      const request = createRequest()
      await request.post(`/api/v1/communities/${community.slug}/members`).expect(401)
    })

    it('joins public community and returns 201 as non-member', async () => {
      const [owner, joiner] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `members-join-ok-${random}`,
        visibility: 'public',
      })

      const request = createRequest()
      await request.authenticateAs(joiner!)

      await request.post(`/api/v1/communities/${community.slug}/members`).expect(201)
    })
  })

  describe('DELETE /api/v1/communities/:slug/members', () => {
    it('returns 401 without auth', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `members-leave-401-${random}`,
      })

      const request = createRequest()
      await request.delete(`/api/v1/communities/${community.slug}/members`).expect(401)
    })

    it('leaves community and returns 204 as member', async () => {
      const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `members-leave-ok-${random}`,
        visibility: 'public',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: member!.id,
        role: 'member',
      })

      const request = createRequest()
      await request.authenticateAs(member!)

      await request.delete(`/api/v1/communities/${community.slug}/members`).expect(204)
    })
  })

  describe('PATCH /api/v1/communities/:slug/members/:userId', () => {
    it('returns 403 as non-owner', async () => {
      const [owner, mod, target] = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `members-role-403-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({
          communityId: community.id,
          userId: mod!.id,
          role: 'member',
        }),
        insertTestCommunityMember({
          communityId: community.id,
          userId: target!.id,
          role: 'member',
        }),
      ])

      const request = createRequest()
      await request.authenticateAs(mod!)

      await request
        .patch(`/api/v1/communities/${community.slug}/members/${target!.id}`)
        .set('Content-Type', 'application/json')
        .send({ role: 'moderator' })
        .expect(403)
    })

    it('updates member role and returns 204 as owner', async () => {
      const [owner, target] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `members-role-ok-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({
          communityId: community.id,
          userId: owner!.id,
          role: 'owner',
        }),
        insertTestCommunityMember({
          communityId: community.id,
          userId: target!.id,
          role: 'member',
        }),
      ])

      const request = createRequest()
      await request.authenticateAs(owner!)

      await request
        .patch(`/api/v1/communities/${community.slug}/members/${target!.id}`)
        .set('Content-Type', 'application/json')
        .send({ role: 'moderator' })
        .expect(204)
    })
  })

  describe('DELETE /api/v1/communities/:slug/members/:userId', () => {
    it('returns 403 as non-mod', async () => {
      const [owner, regular, target] = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `members-remove-403-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({
          communityId: community.id,
          userId: regular!.id,
          role: 'member',
        }),
        insertTestCommunityMember({
          communityId: community.id,
          userId: target!.id,
          role: 'member',
        }),
      ])

      const request = createRequest()
      await request.authenticateAs(regular!)

      await request
        .delete(`/api/v1/communities/${community.slug}/members/${target!.id}`)
        .expect(403)
    })

    it('removes member and returns 204 as owner', async () => {
      const [owner, target] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `members-remove-ok-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({
          communityId: community.id,
          userId: owner!.id,
          role: 'owner',
        }),
        insertTestCommunityMember({
          communityId: community.id,
          userId: target!.id,
          role: 'member',
        }),
      ])

      const request = createRequest()
      await request.authenticateAs(owner!)

      await request
        .delete(`/api/v1/communities/${community.slug}/members/${target!.id}`)
        .expect(204)
    })
  })

  describe('POST /api/v1/communities/:idOrSlug/ownership-transfers', () => {
    it('owner can transfer to an eligible moderator and returns 204', async () => {
      const [owner, moderator] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      await createTestMembership({ user_id: moderator!.id, plan: 'plus' })
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `transfer-ok-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({
          communityId: community.id,
          userId: owner!.id,
          role: 'owner',
        }),
        insertTestCommunityMember({
          communityId: community.id,
          userId: moderator!.id,
          role: 'moderator',
        }),
      ])

      const request = createRequest()
      await request.authenticateAs(owner!)

      await request
        .post(`/api/v1/communities/${community.slug}/ownership-transfers`)
        .set('Content-Type', 'application/json')
        .send({ user_id: moderator!.id })
        .expect(204)
    })

    it('returns 403 for non-owner', async () => {
      const [owner, regularMember, moderator] = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `transfer-403-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({
          communityId: community.id,
          userId: owner!.id,
          role: 'owner',
        }),
        insertTestCommunityMember({
          communityId: community.id,
          userId: regularMember!.id,
          role: 'member',
        }),
        insertTestCommunityMember({
          communityId: community.id,
          userId: moderator!.id,
          role: 'moderator',
        }),
      ])

      const request = createRequest()
      await request.authenticateAs(regularMember!)

      await request
        .post(`/api/v1/communities/${community.slug}/ownership-transfers`)
        .set('Content-Type', 'application/json')
        .send({ user_id: moderator!.id })
        .expect(403)
    })
  })
})
