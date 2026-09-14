import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'
import { getPrivateUserByAny } from '@services/users/get'
import { recordModeratorAction } from '@services/moderator-actions'
import type { PrivateUser } from '@services/users/types'
import crypto from 'node:crypto'

describe('GET /api/v1/communities/:idOrSlug/moderator-stats', () => {
  let owner: PrivateUser
  let moderatorUser: PrivateUser
  let regularUser: PrivateUser
  let siteAdmin: PrivateUser

  beforeAll(async () => {
    ;[owner, regularUser, siteAdmin] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    moderatorUser = await createTestUser()
    await addUserRole(moderatorUser.id, 'moderator')
    moderatorUser = (await getPrivateUserByAny(moderatorUser.id))!
  })

  it('returns 401 for unauthenticated requests', async () => {
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Mod Stats 401 ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-stats-401-${crypto.randomUUID().slice(0, 8)}`,
    })
    const request = createRequest()
    await request.get(`/api/v1/communities/${community.slug}/moderator-stats`).expect(401)
  })

  it('returns 403 for a regular non-member user', async () => {
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Mod Stats 403 ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-stats-403-${crypto.randomUUID().slice(0, 8)}`,
    })
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get(`/api/v1/communities/${community.slug}/moderator-stats`).expect(403)
  })

  it('returns 403 for a regular community member', async () => {
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Mod Stats 403b ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-stats-403b-${crypto.randomUUID().slice(0, 8)}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: regularUser.id })
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get(`/api/v1/communities/${community.slug}/moderator-stats`).expect(403)
  })

  it('returns 200 with stats for the community owner', async () => {
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Mod Stats Owner ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-stats-owner-${crypto.randomUUID().slice(0, 8)}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await recordModeratorAction(owner.id, {
      actionType: 'remove',
      communityId: community.id,
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    const res = await request
      .get(`/api/v1/communities/${community.slug}/moderator-stats`)
      .expect(200)

    expect(res.body.window).toBe(30)
    expect(Array.isArray(res.body.stats)).toBe(true)
    const ownerStat = res.body.stats.find((s: { actor_id: string }) => s.actor_id === owner.id)
    expect(ownerStat).toBeDefined()
    expect(ownerStat.counts.remove).toBeGreaterThanOrEqual(1)
    expect(typeof res.body.users).toBe('object')
  })

  it('returns 200 with stats for a site moderator', async () => {
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Mod Stats Staff ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-stats-staff-${crypto.randomUUID().slice(0, 8)}`,
    })
    const request = createRequest()
    await request.authenticateAs(moderatorUser)
    const res = await request
      .get(`/api/v1/communities/${community.slug}/moderator-stats`)
      .expect(200)
    expect(res.body.window).toBe(30)
  })

  it('returns 200 with stats for a site admin', async () => {
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Mod Stats Admin ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-stats-admin-${crypto.randomUUID().slice(0, 8)}`,
    })
    const request = createRequest()
    await request.authenticateAs(siteAdmin)
    const res = await request
      .get(`/api/v1/communities/${community.slug}/moderator-stats`)
      .expect(200)
    expect(res.body.window).toBe(30)
  })

  it('returns 200 with a 90-day window when requested', async () => {
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Mod Stats 90d ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-stats-90d-${crypto.randomUUID().slice(0, 8)}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const request = createRequest()
    await request.authenticateAs(owner)
    const res = await request
      .get(`/api/v1/communities/${community.slug}/moderator-stats?window=90`)
      .expect(200)
    expect(res.body.window).toBe(90)
  })

  it('defaults to 30-day window for invalid window param', async () => {
    const community = await insertTestCommunity({
      createdById: owner.id,
      name: `Mod Stats Default ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-stats-default-${crypto.randomUUID().slice(0, 8)}`,
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const request = createRequest()
    await request.authenticateAs(owner)
    const res = await request
      .get(`/api/v1/communities/${community.slug}/moderator-stats?window=7`)
      .expect(200)
    expect(res.body.window).toBe(30)
  })
})
