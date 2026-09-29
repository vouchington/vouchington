import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModeratorAction,
  createRandomString,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'

describe('GET /api/v1/communities/:idOrSlug/modlog', () => {
  let owner: PrivateUser
  let moderator: PrivateUser
  let member: PrivateUser
  let community: Community

  beforeAll(async () => {
    const suffix = createRandomString(8)
    ;[owner, moderator, member] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    community = await insertTestCommunity({
      createdById: owner.id,
      slug: `modlog-comm-${suffix}`,
    })
    await Promise.all([
      insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: member.id,
        role: 'member',
      }),
    ])
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get(`/api/v1/communities/${community.slug}/modlog`).expect(401)
  })

  it('returns 403 for a regular member', async () => {
    const request = createRequest()
    await request.authenticateAs(member)
    await request.get(`/api/v1/communities/${community.slug}/modlog`).expect(403)
  })

  it('returns 403 for an authenticated user with no membership', async () => {
    const outsider = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(outsider)
    await request.get(`/api/v1/communities/${community.slug}/modlog`).expect(403)
  })

  it('returns 200 with results for the community owner', async () => {
    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request.get(`/api/v1/communities/${community.slug}/modlog`).expect(200)

    expect(response.body).toHaveProperty('results')
    expect(response.body).toHaveProperty('page_info')
    expect(response.body).toHaveProperty('moderator_actions')
    expect(response.body).toHaveProperty('users')
    expect(Array.isArray(response.body.results)).toBe(true)
  })

  it('returns 200 with results for a community moderator', async () => {
    const request = createRequest()
    await request.authenticateAs(moderator)
    const response = await request.get(`/api/v1/communities/${community.slug}/modlog`).expect(200)

    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body).toHaveProperty('page_info')
  })

  it('returns only actions for the requested community', async () => {
    const suffix = createRandomString(8)
    const otherOwner = await createTestUser()
    const otherCommunity = await insertTestCommunity({
      createdById: otherOwner.id,
      slug: `modlog-other-${suffix}`,
    })
    await insertTestCommunityMember({
      communityId: otherCommunity.id,
      userId: otherOwner.id,
      role: 'owner',
    })

    // Insert an action for the main community
    const { id: actionId } = await insertTestModeratorAction({
      actorId: owner.id,
      actionType: 'warn',
      communityId: community.id,
      targetUserId: member.id,
    })
    // Insert an action for the other community
    await insertTestModeratorAction({
      actorId: otherOwner.id,
      actionType: 'ban',
      communityId: otherCommunity.id,
      targetUserId: member.id,
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request.get(`/api/v1/communities/${community.slug}/modlog`).expect(200)

    const ids = response.body.results.map((r: { id: string }) => r.id)
    expect(ids).toContain(actionId)
    // All returned actions belong to the community
    for (const id of ids) {
      expect(response.body.moderator_actions[id].community_id).toBe(community.id)
    }
  })

  it('returns action data in moderator_actions sidecar', async () => {
    const { id: actionId } = await insertTestModeratorAction({
      actorId: moderator.id,
      actionType: 'lock',
      communityId: community.id,
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request.get(`/api/v1/communities/${community.slug}/modlog`).expect(200)

    const ids = response.body.results.map((r: { id: string }) => r.id)
    expect(ids).toContain(actionId)
    const action = response.body.moderator_actions[actionId]
    expect(action).toBeDefined()
    expect(action.community_id).toBe(community.id)
    expect(action.action_type).toBe('lock')
  })

  it('lists the activated and the lifted restriction ids in action metadata', async () => {
    const restrictionCommunity = await insertTestCommunity({
      createdById: owner.id,
      slug: `modlog-restrictions-${createRandomString(8)}`,
    })
    await insertTestCommunityMember({
      communityId: restrictionCommunity.id,
      userId: owner.id,
      role: 'owner',
    })
    const request = createRequest()
    await request.authenticateAs(owner)
    const activated = await request
      .post(`/api/v1/communities/${restrictionCommunity.slug}/restrictions`)
      .send({ restriction_types: ['require_post_approval', 'no_links'] })
      .expect(201)
    const restrictions = Object.values(activated.body.community_restrictions) as { id: string }[]
    await request
      .delete(
        `/api/v1/communities/${restrictionCommunity.slug}/restrictions/${restrictions[1]!.id}`,
      )
      .expect(204)

    const response = await request
      .get(`/api/v1/communities/${restrictionCommunity.slug}/modlog`)
      .expect(200)

    const actions = Object.values(response.body.moderator_actions) as {
      action_type: string
      metadata: Record<string, unknown>
    }[]
    const metadataOf = (type: string) =>
      actions.find(action => action.action_type === type)?.metadata
    expect(metadataOf('activate_restriction')).toMatchObject({
      restriction_ids: restrictions.map(restriction => restriction.id),
      restriction_types: ['require_post_approval', 'no_links'],
    })
    expect(metadataOf('lift_restriction')).toEqual({
      restriction_id: restrictions[1]!.id,
      restriction_type: 'no_links',
    })
  })
})
