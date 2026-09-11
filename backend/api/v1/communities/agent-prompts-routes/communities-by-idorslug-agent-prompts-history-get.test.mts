import { describe, it, expect } from 'vitest'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  createRandomString,
} from '@voucha/test-helpers'

describe('GET /api/v1/communities/:idOrSlug/agent-prompts/history', () => {
  it('returns 401 for unauthenticated request', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `hist-401-${random}`,
    })

    const request = createRequest()
    await request.get(`/api/v1/communities/${community.slug}/agent-prompts/history`).expect(401)
  })

  it('returns 403 for non-moderator member', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `hist-403-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member.id,
      role: 'member',
    })

    const request = createRequest()
    await request.authenticateAs(member)
    await request.get(`/api/v1/communities/${community.slug}/agent-prompts/history`).expect(403)
  })

  it('returns 200 with empty history for moderator', async () => {
    const owner = await createTestUser()
    const mod = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `hist-200-mod-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: mod.id,
      role: 'moderator',
    })

    const request = createRequest()
    await request.authenticateAs(mod)
    const res = await request
      .get(`/api/v1/communities/${community.slug}/agent-prompts/history`)
      .expect(200)

    expect(Array.isArray(res.body.entries)).toBe(true)
    expect(res.body.next_cursor).toBeNull()
  })

  it('returns 200 with empty history for owner', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `hist-200-owner-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    const res = await request
      .get(`/api/v1/communities/${community.slug}/agent-prompts/history`)
      .expect(200)

    expect(Array.isArray(res.body.entries)).toBe(true)
    expect(res.body.next_cursor).toBeNull()
  })

  it('returns 400 for invalid UUID in promptId query param', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `hist-400-pid-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    await request
      .get(`/api/v1/communities/${community.slug}/agent-prompts/history?promptId=not-a-uuid`)
      .expect(400)
  })

  it('returns 400 for invalid UUID in before query param', async () => {
    const owner = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `hist-400-bef-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })

    const request = createRequest()
    await request.authenticateAs(owner)
    await request
      .get(`/api/v1/communities/${community.slug}/agent-prompts/history?before=not-a-uuid`)
      .expect(400)
  })
})
