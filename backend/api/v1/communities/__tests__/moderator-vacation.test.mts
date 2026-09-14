import { beforeAll, describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import type { Community } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'

describe('moderator vacation routes', () => {
  let moderator: PrivateUser
  let member: PrivateUser
  let community: Community
  let privateOwner: PrivateUser
  let privateCommunity: Community

  beforeAll(async () => {
    ;[moderator, member, privateOwner] = (await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])) as PrivateUser[]
    community = await insertTestCommunity({ createdById: moderator.id })
    privateCommunity = await insertTestCommunity({
      createdById: privateOwner.id,
      visibility: 'private',
    })
    await Promise.all([
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id, role: 'member' }),
      insertTestCommunityMember({
        communityId: privateCommunity.id,
        userId: privateOwner.id,
        role: 'owner',
      }),
    ])
  })

  describe('PATCH /api/v1/communities/:idOrSlug/moderator-vacation', () => {
    it('updates only the digest suppression preference', async () => {
      const request = createRequest()
      await request.authenticateAs(moderator)
      await request
        .patch(`/api/v1/communities/${community.slug}/moderator-vacation`)
        .send({ suppress_community_digests_while_on_vacation: true })
        .expect(200, { suppress_community_digests_while_on_vacation: true })
      const response = await request
        .get(`/api/v1/communities/${community.slug}/moderator-vacation`)
        .expect(200)
      expect(response.body).toEqual({
        vacation: null,
        suppress_community_digests_while_on_vacation: true,
      })
    })

    it('requires a boolean preference', async () => {
      const request = createRequest()
      await request.authenticateAs(moderator)
      await request
        .patch(`/api/v1/communities/${community.slug}/moderator-vacation`)
        .send({ suppress_community_digests_while_on_vacation: 'yes' })
        .expect(422)
    })
  })

  describe('GET /api/v1/communities/:idOrSlug/moderator-vacation', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get(`/api/v1/communities/${community.slug}/moderator-vacation`).expect(401)
    })

    it('returns 403 for a non-moderator member', async () => {
      const request = createRequest()
      await request.authenticateAs(member)
      await request.get(`/api/v1/communities/${community.slug}/moderator-vacation`).expect(403)
    })

    it('returns 403 for a non-member of a private community', async () => {
      const outsider = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(outsider)
      await request
        .get(`/api/v1/communities/${privateCommunity.slug}/moderator-vacation`)
        .expect(403)
    })

    it('returns 200 with null vacation for moderator with no active vacation', async () => {
      const request = createRequest()
      await request.authenticateAs(moderator)
      const res = await request
        .get(`/api/v1/communities/${community.slug}/moderator-vacation`)
        .expect(200)
      expect(res.body.vacation).toBeNull()
    })
  })

  describe('PUT /api/v1/communities/:idOrSlug/moderator-vacation', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .put(`/api/v1/communities/${community.slug}/moderator-vacation`)
        .send({})
        .expect(401)
    })

    it('returns 403 for a non-moderator member', async () => {
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .put(`/api/v1/communities/${community.slug}/moderator-vacation`)
        .send({})
        .expect(403)
    })

    it('sets an indefinite vacation and returns the row', async () => {
      const mod = await createTestUser()
      const comm = await insertTestCommunity({ createdById: mod.id })
      await insertTestCommunityMember({ communityId: comm.id, userId: mod.id, role: 'moderator' })

      const request = createRequest()
      await request.authenticateAs(mod)
      const res = await request
        .put(`/api/v1/communities/${comm.slug}/moderator-vacation`)
        .send({})
        .expect(200)

      expect(res.body.vacation.user_id).toBe(mod.id)
      expect(res.body.vacation.community_id).toBe(comm.id)
      expect(res.body.vacation.ends_at).toBeNull()
      expect(res.body.suppress_community_digests_while_on_vacation).toBe(false)
    })

    it('preserves the digest suppression preference in the shared response', async () => {
      const mod = await createTestUser()
      const comm = await insertTestCommunity({ createdById: mod.id })
      await insertTestCommunityMember({ communityId: comm.id, userId: mod.id, role: 'moderator' })

      const request = createRequest()
      await request.authenticateAs(mod)
      await request
        .patch(`/api/v1/communities/${comm.slug}/moderator-vacation`)
        .send({ suppress_community_digests_while_on_vacation: true })
        .expect(200)
      const response = await request
        .put(`/api/v1/communities/${comm.slug}/moderator-vacation`)
        .send({})
        .expect(200)

      expect(response.body).toMatchObject({
        vacation: { user_id: mod.id, community_id: comm.id },
        suppress_community_digests_while_on_vacation: true,
      })
    })

    it('sets a vacation with ends_at', async () => {
      const mod = await createTestUser()
      const comm = await insertTestCommunity({ createdById: mod.id })
      await insertTestCommunityMember({ communityId: comm.id, userId: mod.id, role: 'moderator' })
      const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

      const request = createRequest()
      await request.authenticateAs(mod)
      const res = await request
        .put(`/api/v1/communities/${comm.slug}/moderator-vacation`)
        .send({ ends_at: endsAt })
        .expect(200)

      expect(res.body.vacation.ends_at).not.toBeNull()
    })

    it('returns 422 when ends_at is in the past', async () => {
      const mod = await createTestUser()
      const comm = await insertTestCommunity({ createdById: mod.id })
      await insertTestCommunityMember({ communityId: comm.id, userId: mod.id, role: 'moderator' })
      const pastDate = new Date(Date.now() - 1000).toISOString()

      const request = createRequest()
      await request.authenticateAs(mod)
      await request
        .put(`/api/v1/communities/${comm.slug}/moderator-vacation`)
        .send({ ends_at: pastDate })
        .expect(422)
    })

    it('returns 422 when ends_at is not a string', async () => {
      const mod = await createTestUser()
      const comm = await insertTestCommunity({ createdById: mod.id })
      await insertTestCommunityMember({ communityId: comm.id, userId: mod.id, role: 'moderator' })

      const request = createRequest()
      await request.authenticateAs(mod)
      await request
        .put(`/api/v1/communities/${comm.slug}/moderator-vacation`)
        .send({ ends_at: 2000000000000 })
        .expect(422)
    })

    it('returns 422 when ends_at is not a valid date string', async () => {
      const mod = await createTestUser()
      const comm = await insertTestCommunity({ createdById: mod.id })
      await insertTestCommunityMember({ communityId: comm.id, userId: mod.id, role: 'moderator' })

      const request = createRequest()
      await request.authenticateAs(mod)
      await request
        .put(`/api/v1/communities/${comm.slug}/moderator-vacation`)
        .send({ ends_at: 'not-a-date' })
        .expect(422)
    })
  })

  describe('DELETE /api/v1/communities/:idOrSlug/moderator-vacation', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.delete(`/api/v1/communities/${community.slug}/moderator-vacation`).expect(401)
    })

    it('returns 403 for a non-moderator member', async () => {
      const request = createRequest()
      await request.authenticateAs(member)
      await request.delete(`/api/v1/communities/${community.slug}/moderator-vacation`).expect(403)
    })

    it('clears an active vacation and returns 204', async () => {
      const mod = await createTestUser()
      const comm = await insertTestCommunity({ createdById: mod.id })
      await insertTestCommunityMember({ communityId: comm.id, userId: mod.id, role: 'moderator' })

      const request = createRequest()
      await request.authenticateAs(mod)
      await request.put(`/api/v1/communities/${comm.slug}/moderator-vacation`).send({}).expect(200)
      await request.delete(`/api/v1/communities/${comm.slug}/moderator-vacation`).expect(204)
    })

    it('is a no-op (204) when no vacation is set', async () => {
      const mod = await createTestUser()
      const comm = await insertTestCommunity({ createdById: mod.id })
      await insertTestCommunityMember({ communityId: comm.id, userId: mod.id, role: 'moderator' })

      const request = createRequest()
      await request.authenticateAs(mod)
      await request.delete(`/api/v1/communities/${comm.slug}/moderator-vacation`).expect(204)
    })
  })
})
