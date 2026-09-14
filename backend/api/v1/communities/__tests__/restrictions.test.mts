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

describe('Community Restriction Routes', () => {
  describe('GET /api/v1/communities/:slug/restrictions', () => {
    it('returns 401 without auth', async () => {
      const owner = await createTestUser()
      const community = await insertTestCommunity({
        createdById: owner.id,
        slug: `restrictions-get-401-${createRandomString(8)}`,
      })

      await createRequest().get(`/api/v1/communities/${community.slug}/restrictions`).expect(401)
    })

    it('returns 403 for regular members', async () => {
      const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
      const community = await insertCommunityWithOwner(owner!.id)
      await insertTestCommunityMember({ communityId: community.id, userId: member!.id })

      const request = createRequest()
      await request.authenticateAs(member!)
      await request.get(`/api/v1/communities/${community.slug}/restrictions`).expect(403)
    })

    it('returns restrictions and raid mode suggestion metadata', async () => {
      const owner = await createTestUser()
      const community = await insertCommunityWithOwner(owner.id)
      const restriction = await insertTestCommunityRestriction({
        communityId: community.id,
        restrictionType: 'no_links',
        activatedById: owner.id,
      })

      const request = createRequest()
      await request.authenticateAs(owner)
      const response = await request
        .get(`/api/v1/communities/${community.slug}/restrictions`)
        .expect(200)

      expect(response.body.results).toContainEqual({
        __entity_type: 'community_restriction',
        id: restriction.id,
      })
      expect(response.body.community_restrictions[restriction.id].restriction_type).toBe('no_links')
      expect(response.body.raid_mode_suggestion).toEqual({
        velocity_spike: false,
        flag_count: 0,
        latest_flagged_at: null,
      })
    })

    it('paginates from active restrictions into newer historical restrictions', async () => {
      const owner = await createTestUser()
      const community = await insertCommunityWithOwner(owner.id)
      const activeRestrictionIds: string[] = []
      for (let index = 0; index < 21; index++) {
        const restriction = await insertTestCommunityRestriction({
          communityId: community.id,
          restrictionType: 'require_post_approval',
          activatedById: owner.id,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        })
        activeRestrictionIds.push(restriction.id)
      }
      const historicalRestrictionIds: string[] = []
      for (let index = 0; index < 2; index++) {
        const restriction = await insertTestCommunityRestriction({
          communityId: community.id,
          restrictionType: 'no_links',
          activatedById: owner.id,
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        })
        historicalRestrictionIds.push(restriction.id)
      }
      const request = createRequest()
      await request.authenticateAs(owner)

      const firstPage = await request
        .get(`/api/v1/communities/${community.slug}/restrictions?limit=20`)
        .expect(200)
      const secondPage = await request
        .get(
          `/api/v1/communities/${community.slug}/restrictions?limit=20&after=${encodeURIComponent(firstPage.body.page_info.end_cursor)}`,
        )
        .expect(200)

      const secondPageIds = secondPage.body.results.map((result: { id: string }) => result.id)
      expect(secondPageIds).toContain(activeRestrictionIds[0])
      expect(secondPageIds).toEqual(expect.arrayContaining(historicalRestrictionIds))
    })
  })

  describe('POST /api/v1/communities/:slug/restrictions', () => {
    it('activates selected restrictions', async () => {
      const owner = await createTestUser()
      const community = await insertCommunityWithOwner(owner.id)
      const request = createRequest()
      await request.authenticateAs(owner)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/restrictions`)
        .send({
          restriction_types: ['require_post_approval', 'no_links'],
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          reason: 'incoming brigade',
        })
        .expect(201)

      expect(Object.values(response.body.community_restrictions)).toHaveLength(2)
      const activeTypes = (await getActiveCommunityRestrictions(community.id)).map(
        restriction => restriction.restriction_type,
      )
      expect(activeTypes).toEqual(expect.arrayContaining(['require_post_approval', 'no_links']))
    })

    it('deduplicates restriction types and returns them in canonical order', async () => {
      const owner = await createTestUser()
      const community = await insertCommunityWithOwner(owner.id)
      const request = createRequest()
      await request.authenticateAs(owner)

      const response = await request
        .post(`/api/v1/communities/${community.slug}/restrictions`)
        .send({ restriction_types: ['no_links', 'require_post_approval', 'no_links'] })
        .expect(201)

      expect(
        (Object.values(response.body.community_restrictions) as { restriction_type: string }[]).map(
          restriction => restriction.restriction_type,
        ),
      ).toEqual(['require_post_approval', 'no_links'])
    })

    it('inserts a new row when re-activating an already-active restriction type', async () => {
      const owner = await createTestUser()
      const community = await insertCommunityWithOwner(owner.id)
      const activatedAt = new Date('2026-01-01T00:00:00.000Z')
      const original = await insertTestCommunityRestriction({
        communityId: community.id,
        restrictionType: 'no_new_member_posts',
        activatedById: owner.id,
        activatedAt,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      const request = createRequest()
      await request.authenticateAs(owner)

      await request
        .post(`/api/v1/communities/${community.slug}/restrictions`)
        .send({
          restriction_types: ['no_new_member_posts'],
          expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          reason: 'second activation',
        })
        .expect(201)

      // A second row is inserted; the type is still active (two valid rows now exist).
      const active = await getActiveCommunityRestrictions(community.id)
      expect(active).toHaveLength(2)
      expect(active.map(r => r.restriction_type)).toEqual([
        'no_new_member_posts',
        'no_new_member_posts',
      ])

      // The original row is untouched — no timestamp updates.
      const originalRow = active.find(r => r.id === original.id)
      expect(originalRow).toBeDefined()
      expect(originalRow?.activated_at).toEqual(activatedAt)
    })

    it('type stays active after lifting one of two active rows; cleared only when both are lifted', async () => {
      const owner = await createTestUser()
      const community = await insertCommunityWithOwner(owner.id)
      const row1 = await insertTestCommunityRestriction({
        communityId: community.id,
        restrictionType: 'no_links',
        activatedById: owner.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      const row2 = await insertTestCommunityRestriction({
        communityId: community.id,
        restrictionType: 'no_links',
        activatedById: owner.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      const request = createRequest()
      await request.authenticateAs(owner)

      // Lift the first row — type should still be in place (row2 is still valid).
      await request
        .delete(`/api/v1/communities/${community.slug}/restrictions/${row1.id}`)
        .expect(204)
      expect(await getActiveCommunityRestrictions(community.id)).toHaveLength(1)

      // Lift the second row — type is now fully cleared.
      await request
        .delete(`/api/v1/communities/${community.slug}/restrictions/${row2.id}`)
        .expect(204)
      expect(await getActiveCommunityRestrictions(community.id)).toHaveLength(0)
    })

    it('includes older active restrictions on the first page', async () => {
      const owner = await createTestUser()
      const community = await insertCommunityWithOwner(owner.id)
      const activeRestriction = await insertTestCommunityRestriction({
        communityId: community.id,
        restrictionType: 'no_links',
        activatedById: owner.id,
        activatedAt: new Date('2026-01-01T00:00:00.000Z'),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      await Promise.all(
        Array.from({ length: 25 }, (_, index) =>
          insertTestCommunityRestriction({
            communityId: community.id,
            restrictionType: 'require_post_approval',
            activatedById: owner.id,
            activatedAt: new Date(`2026-02-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
            expiresAt: new Date('2026-03-01T00:00:00.000Z'),
          }),
        ),
      )
      const request = createRequest()
      await request.authenticateAs(owner)

      const response = await request
        .get(`/api/v1/communities/${community.slug}/restrictions`)
        .expect(200)

      expect(response.body.results.map((result: { id: string }) => result.id)).toContain(
        activeRestriction.id,
      )
    })

    it('rejects invalid restriction types', async () => {
      const owner = await createTestUser()
      const community = await insertCommunityWithOwner(owner.id)
      const request = createRequest()
      await request.authenticateAs(owner)

      await request
        .post(`/api/v1/communities/${community.slug}/restrictions`)
        .send({ restriction_types: ['bad'], expires_at: null })
        .expect(422)
    })
  })

  describe('DELETE /api/v1/communities/:slug/restrictions/:id', () => {
    it('lifts an active restriction', async () => {
      const owner = await createTestUser()
      const community = await insertCommunityWithOwner(owner.id)
      const restriction = await insertTestCommunityRestriction({
        communityId: community.id,
        restrictionType: 'no_links',
        activatedById: owner.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      const request = createRequest()
      await request.authenticateAs(owner)

      await request
        .delete(`/api/v1/communities/${community.slug}/restrictions/${restriction.id}`)
        .expect(204)

      expect(await getActiveCommunityRestrictions(community.id)).toHaveLength(0)
    })
  })
})

async function insertCommunityWithOwner(ownerId: string) {
  const community = await insertTestCommunity({
    createdById: ownerId,
    slug: `restrictions-${createRandomString(8)}`,
  })
  await insertTestCommunityMember({ communityId: community.id, userId: ownerId, role: 'owner' })
  return community
}
