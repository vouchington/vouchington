import { describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityBan,
  setTestBanEvasionFlag,
  createRandomString,
} from '@voucha/test-helpers'

describe('Community Ban-Evasion Routes', () => {
  describe('POST /api/v1/communities/:idOrSlug/ban-evasion/:userId', () => {
    it('returns 401 without auth', async () => {
      const owner = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `be-confirm-401-${random}`,
      })

      const request = createRequest()
      await request
        .post(`/api/v1/communities/${community.slug}/ban-evasion/${owner.id}`)
        .expect(401)
    })

    it('returns 403 for regular member', async () => {
      const [owner, member, suspect] = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `be-confirm-403-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: community.id, userId: member!.id }),
        insertTestCommunityMember({ communityId: community.id, userId: suspect!.id }),
      ])

      const request = createRequest()
      await request.authenticateAs(member!)
      await request
        .post(`/api/v1/communities/${community.slug}/ban-evasion/${suspect!.id}`)
        .expect(403)
    })

    it('returns 403 for community owner because ban-evasion evidence is staff-only', async () => {
      const [owner, source, suspect] = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `be-confirm-ok-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: community.id, userId: source!.id }),
        insertTestCommunityMember({ communityId: community.id, userId: suspect!.id }),
      ])
      await insertTestCommunityBan({
        communityId: community.id,
        userId: source!.id,
        bannedById: owner!.id,
      })
      await setTestBanEvasionFlag({
        communityId: community.id,
        userId: suspect!.id,
        sourceUserId: source!.id,
        score: 0.8,
      })

      const request = createRequest()
      await request.authenticateAs(owner!)
      await request
        .post(`/api/v1/communities/${community.slug}/ban-evasion/${suspect!.id}`)
        .expect(403)
    })

    it('site staff confirms ban evasion and returns 204', async () => {
      const [staff, owner, source, suspect] = await Promise.all([
        createTestUser({ administrator: true }),
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `be-confirm-staff-ok-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: community.id, userId: source!.id }),
        insertTestCommunityMember({ communityId: community.id, userId: suspect!.id }),
      ])
      await insertTestCommunityBan({
        communityId: community.id,
        userId: source!.id,
        bannedById: owner!.id,
      })
      await setTestBanEvasionFlag({
        communityId: community.id,
        userId: suspect!.id,
        sourceUserId: source!.id,
        score: 0.8,
      })

      const request = createRequest()
      await request.authenticateAs(staff!)
      await request
        .post(`/api/v1/communities/${community.slug}/ban-evasion/${suspect!.id}`)
        .expect(204)
    })
  })

  describe('DELETE /api/v1/communities/:idOrSlug/ban-evasion/:userId', () => {
    it('returns 401 without auth', async () => {
      const owner = await createTestUser()
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `be-dismiss-401-${random}`,
      })

      const request = createRequest()
      await request
        .delete(`/api/v1/communities/${community.slug}/ban-evasion/${owner.id}`)
        .expect(401)
    })

    it('returns 403 for regular member', async () => {
      const [owner, member, suspect] = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `be-dismiss-403-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: community.id, userId: member!.id }),
        insertTestCommunityMember({ communityId: community.id, userId: suspect!.id }),
      ])

      const request = createRequest()
      await request.authenticateAs(member!)
      await request
        .delete(`/api/v1/communities/${community.slug}/ban-evasion/${suspect!.id}`)
        .expect(403)
    })

    it('owner dismisses ban-evasion flag and returns 204', async () => {
      const [owner, source, suspect] = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const random = createRandomString(8)
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `be-dismiss-ok-${random}`,
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: community.id, userId: source!.id }),
        insertTestCommunityMember({ communityId: community.id, userId: suspect!.id }),
      ])
      await setTestBanEvasionFlag({
        communityId: community.id,
        userId: suspect!.id,
        sourceUserId: source!.id,
        score: 0.75,
      })

      const request = createRequest()
      await request.authenticateAs(owner!)
      await request
        .delete(`/api/v1/communities/${community.slug}/ban-evasion/${suspect!.id}`)
        .expect(204)
    })
  })
})
