import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityInvite,
  createRandomString,
} from '@voucha/test-helpers'

describe('Community Invites Routes', () => {
  describe('GET /api/v1/communities/:slug/invites', () => {
    it('returns 401 without auth', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `invites-get-401-${random}`,
      })

      const request = createRequest()
      await request.get(`/api/v1/communities/${community.slug}/invites`).expect(401)
    })

    it('returns 403 as non-mod', async () => {
      const [owner, regular] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `invites-get-403-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: regular!.id,
        role: 'member',
      })

      const request = createRequest()
      await request.authenticateAs(regular!)

      await request.get(`/api/v1/communities/${community.slug}/invites`).expect(403)
    })

    it('returns 200 with results as mod', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `invites-get-ok-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'owner',
      })

      const request = createRequest()
      await request.authenticateAs(user)

      const response = await request
        .get(`/api/v1/communities/${community.slug}/invites`)
        .expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body).toHaveProperty('page_info')
    })
  })

  describe('POST /api/v1/communities/:slug/invites', () => {
    it('returns 401 without auth', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `invites-create-401-${random}`,
      })

      const request = createRequest()
      await request
        .post(`/api/v1/communities/${community.slug}/invites`)
        .set('Content-Type', 'application/json')
        .send({ email: 'tests+test@voucha.ai' })
        .expect(401)
    })

    it('creates invite with email and returns 201 as mod', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `invites-create-email-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'owner',
      })

      const request = createRequest()
      await request.authenticateAs(user)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/invites`)
        .set('Content-Type', 'application/json')
        .send({ email: `tests+invite-${random}@voucha.ai` })
        .expect(201)

      expect(response.body).toHaveProperty('community_invite')
      expect(response.body.community_invite.community_id).toBe(community.id)
    })

    it('creates invite with username and returns 201 as mod', async () => {
      const [owner, invitee] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `invites-create-username-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner!.id,
        role: 'owner',
      })

      const request = createRequest()
      await request.authenticateAs(owner!)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/invites`)
        .set('Content-Type', 'application/json')
        .send({ username: invitee!.username })
        .expect(201)

      expect(response.body).toHaveProperty('community_invite')
      expect(response.body.community_invite.invited_user_id).toBe(invitee!.id)
    })
  })

  describe('DELETE /api/v1/communities/:slug/invites/:id', () => {
    it('revokes invite and returns 204 as mod', async () => {
      const user = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: user.id,
        slug: `invites-delete-ok-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'owner',
      })

      const invite = await insertTestCommunityInvite({
        communityId: community.id,
        invitedById: user.id,
        invitedEmail: `tests+revoke-${random}@voucha.ai`,
      })

      const request = createRequest()
      await request.authenticateAs(user)

      await request.delete(`/api/v1/communities/${community.slug}/invites/${invite.id}`).expect(204)
    })
  })

  describe('POST /api/v1/communities/invite-redemptions', () => {
    it('returns 401 without auth', async () => {
      const request = createRequest()
      await request
        .post('/api/v1/communities/invite-redemptions')
        .set('Content-Type', 'application/json')
        .send({ code: 'testcode' })
        .expect(401)
    })

    it('redeems valid code and returns 200', async () => {
      const [owner, redeemer] = await Promise.all([createTestUser(), createTestUser()])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `invites-redeem-ok-${random}`,
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner!.id,
        role: 'owner',
      })

      const code = createRandomString(8)
      await insertTestCommunityInvite({
        communityId: community.id,
        invitedById: owner!.id,
        invitedUserId: redeemer!.id,
        code,
      })

      const request = createRequest()
      await request.authenticateAs(redeemer!)

      const response = await request
        .post('/api/v1/communities/invite-redemptions')
        .set('Content-Type', 'application/json')
        .send({ code })
        .expect(200)

      expect(response.body).toHaveProperty('community_invite')
    })
  })
})
