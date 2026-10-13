import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityRestriction,
} from '@voucha/test-helpers'
import { getActiveCommunityRestrictions } from '@services/communities/restrictions/get'

describe('Community Restriction Route rejections', () => {
  describe('POST /api/v1/communities/:slug/restrictions', () => {
    it('returns 403 for regular members', async () => {
      const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
      const community = await insertCommunityWithOwner(owner.id)
      await insertTestCommunityMember({ communityId: community.id, userId: member.id })
      const request = createRequest()
      await request.authenticateAs(member)

      await request
        .post(`/api/v1/communities/${community.slug}/restrictions`)
        .send({ restriction_types: ['no_links'], expires_at: null })
        .expect(403)
      expect(await getActiveCommunityRestrictions(community.id)).toHaveLength(0)
    })

    it('returns 404 for a missing community', async () => {
      const owner = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(owner)

      await request
        .post(`/api/v1/communities/missing-${createRandomString(8)}/restrictions`)
        .send({ restriction_types: ['no_links'], expires_at: null })
        .expect(404)
    })
  })

  describe('DELETE /api/v1/communities/:slug/restrictions/:id', () => {
    it('returns 403 for regular members and leaves the restriction active', async () => {
      const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
      const community = await insertCommunityWithOwner(owner.id)
      await insertTestCommunityMember({ communityId: community.id, userId: member.id })
      const restriction = await insertTestCommunityRestriction({
        communityId: community.id,
        restrictionType: 'no_links',
        activatedById: owner.id,
      })
      const request = createRequest()
      await request.authenticateAs(member)

      await request
        .delete(`/api/v1/communities/${community.slug}/restrictions/${restriction.id}`)
        .expect(403)
      expect(await getActiveCommunityRestrictions(community.id)).toHaveLength(1)
    })

    it('returns 404 for a missing community', async () => {
      const owner = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(owner)

      await request
        .delete(
          `/api/v1/communities/missing-${createRandomString(8)}/restrictions/${crypto.randomUUID()}`,
        )
        .expect(404)
    })
  })
})

async function insertCommunityWithOwner(ownerId: string) {
  const community = await insertTestCommunity({
    createdById: ownerId,
    slug: `restrictions-rejections-${createRandomString(8)}`,
  })
  await insertTestCommunityMember({ communityId: community.id, userId: ownerId, role: 'owner' })
  return community
}
