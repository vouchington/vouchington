import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestModeratorAction,
  createRandomString,
} from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'
import { getPrivateUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/admin/modlog', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser
  let moderatorUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    moderatorUser = await createTestUser()
    await addUserRole(moderatorUser.id, 'moderator')
    moderatorUser = (await getPrivateUserByAny(moderatorUser.id))!
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/admin/modlog').expect(401)
  })

  it('returns 403 for non-admin regular users', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get('/api/v1/admin/modlog').expect(403)
  })

  it('returns 403 for site moderators (admin-only endpoint)', async () => {
    const request = createRequest()
    await request.authenticateAs(moderatorUser)
    await request.get('/api/v1/admin/modlog').expect(403)
  })

  it('returns 200 with results and page_info for admin', async () => {
    const suffix = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: admin.id,
      slug: `modlog-admin-200-${suffix}`,
    })
    await insertTestModeratorAction({
      actorId: admin.id,
      actionType: 'ban',
      communityId: community.id,
      targetUserId: regularUser.id,
    })

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request.get('/api/v1/admin/modlog').expect(200)

    expect(response.body).toHaveProperty('results')
    expect(response.body).toHaveProperty('page_info')
    expect(response.body).toHaveProperty('moderator_actions')
    expect(response.body).toHaveProperty('users')
    expect(Array.isArray(response.body.results)).toBe(true)
  })

  it('returns moderator actions in results', async () => {
    const suffix = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: admin.id,
      slug: `modlog-admin-action-${suffix}`,
    })
    const { id: actionId } = await insertTestModeratorAction({
      actorId: admin.id,
      actionType: 'warn',
      communityId: community.id,
      targetUserId: regularUser.id,
    })

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(`/api/v1/admin/modlog?community_id=${community.id}`)
      .expect(200)

    const ids = response.body.results.map((r: { id: string }) => r.id)
    expect(ids).toContain(actionId)
    expect(response.body.moderator_actions[actionId]).toBeDefined()
  })

  it('filters by community_id', async () => {
    const suffix = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: admin.id,
      slug: `modlog-admin-cfilter-${suffix}`,
    })
    const { id: actionId } = await insertTestModeratorAction({
      actorId: admin.id,
      actionType: 'lock',
      communityId: community.id,
    })

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(`/api/v1/admin/modlog?community_id=${community.id}`)
      .expect(200)

    const ids = response.body.results.map((r: { id: string }) => r.id)
    expect(ids).toContain(actionId)
    for (const id of ids) {
      expect(response.body.moderator_actions[id].community_id).toBe(community.id)
    }
  })

  it('filters by actor_id', async () => {
    const suffix = createRandomString(8)
    const actor = await createTestUser()
    const community = await insertTestCommunity({
      createdById: admin.id,
      slug: `modlog-admin-afilter-${suffix}`,
    })
    const { id: actionId } = await insertTestModeratorAction({
      actorId: actor.id,
      actionType: 'remove',
      communityId: community.id,
    })

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request.get(`/api/v1/admin/modlog?actor_id=${actor.id}`).expect(200)

    const ids = response.body.results.map((r: { id: string }) => r.id)
    expect(ids).toContain(actionId)
    for (const id of ids) {
      expect(response.body.moderator_actions[id].actor_id).toBe(actor.id)
    }
  })

  it('filters by action_type', async () => {
    const suffix = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: admin.id,
      slug: `modlog-admin-tfilter-${suffix}`,
    })
    await insertTestModeratorAction({
      actorId: admin.id,
      actionType: 'suspend',
      communityId: community.id,
      targetUserId: regularUser.id,
    })

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(`/api/v1/admin/modlog?community_id=${community.id}&action_type=suspend`)
      .expect(200)

    expect(Array.isArray(response.body.results)).toBe(true)
    for (const id of response.body.results.map((r: { id: string }) => r.id)) {
      expect(response.body.moderator_actions[id].action_type).toBe('suspend')
    }
  })

  it('returns 422 for invalid community_id UUID', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get('/api/v1/admin/modlog?community_id=not-a-uuid').expect(422)
  })

  it('returns 422 for invalid actor_id UUID', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get('/api/v1/admin/modlog?actor_id=not-a-uuid').expect(422)
  })
})
