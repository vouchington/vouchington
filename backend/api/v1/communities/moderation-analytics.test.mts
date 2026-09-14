import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModeratorAction,
} from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'
import { getPrivateUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'
import crypto from 'node:crypto'

describe('GET /api/v1/communities/:idOrSlug/moderation-analytics', () => {
  let owner: PrivateUser
  let siteModerator: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[owner, regularUser] = await Promise.all([createTestUser(), createTestUser()])
    siteModerator = await createTestUser()
    await addUserRole(siteModerator.id, 'moderator')
    siteModerator = (await getPrivateUserByAny(siteModerator.id))!
  })

  it('returns 401 for unauthenticated requests', async () => {
    const community = await createCommunity('analytics-401')
    const request = createRequest()
    await request.get(`/api/v1/communities/${community.slug}/moderation-analytics`).expect(401)
  })

  it('returns 403 for regular non-member users', async () => {
    const community = await createCommunity('analytics-403')
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get(`/api/v1/communities/${community.slug}/moderation-analytics`).expect(403)
  })

  it('returns analytics for community owners', async () => {
    const community = await createCommunity('analytics-owner')
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request
      .get(`/api/v1/communities/${community.slug}/moderation-analytics`)
      .expect(200)

    expect(response.body.range).toBe('30d')
    expect(response.body.scope).toEqual({ type: 'community', community_id: community.id })
    expect(response.body).toHaveProperty('queue_volume')
    expect(response.body).toHaveProperty('automod_performance')
    expect(Array.isArray(response.body.rule_violations.reasons)).toBe(true)
  })

  it('returns analytics for site moderators', async () => {
    const community = await createCommunity('analytics-staff')
    const request = createRequest()
    await request.authenticateAs(siteModerator)
    const response = await request
      .get(`/api/v1/communities/${community.slug}/moderation-analytics?range=7d`)
      .expect(200)

    expect(response.body.range).toBe('7d')
  })

  it('falls back to 30d for invalid range params', async () => {
    const community = await createCommunity('analytics-invalid')
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request
      .get(`/api/v1/communities/${community.slug}/moderation-analytics?range=invalid`)
      .expect(200)

    expect(response.body.range).toBe('30d')
  })

  it('hydrates moderator workload users', async () => {
    const community = await createCommunity('analytics-users')
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestModeratorAction({
      actorId: siteModerator.id,
      actionType: 'remove',
      communityId: community.id,
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request
      .get(`/api/v1/communities/${community.slug}/moderation-analytics?range=all`)
      .expect(200)

    expect(response.body.moderator_workload.moderators).toEqual(
      expect.arrayContaining([expect.objectContaining({ actor_id: siteModerator.id })]),
    )
    expect(response.body.moderator_workload.users[siteModerator.id]).toEqual(
      expect.objectContaining({ id: siteModerator.id }),
    )
  })

  function createCommunity(prefix: string) {
    const suffix = crypto.randomUUID().slice(0, 8)
    return insertTestCommunity({
      createdById: owner.id,
      name: `Moderation Analytics ${prefix} ${suffix}`,
      slug: `moderation-${prefix}-${suffix}`,
    })
  }
})
