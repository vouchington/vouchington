import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, insertTestCommunity, insertTestCommunityBan } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/my/bans', () => {
  let user: PrivateUser
  let owner: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    owner = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/bans').expect(401)
  })

  it('returns empty bans for a user with no bans', async () => {
    const newUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(newUser)

    const response = await request.get('/api/v1/my/bans').expect(200)
    expect(Array.isArray(response.body.bans)).toBe(true)
    expect(response.body.bans.length).toBe(0)
    expect(response.body.page_info).toHaveProperty('has_next_page', false)
  })

  it('returns active bans for the authenticated user', async () => {
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityBan({
      communityId: community.id,
      userId: user.id,
      bannedById: owner.id,
      reason: 'API test violation',
    })

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/bans').expect(200)
    const bans = response.body.bans
    expect(Array.isArray(bans)).toBe(true)
    const found = bans.find((b: { community_id: string }) => b.community_id === community.id)
    expect(found).toBeDefined()
    expect(found.__entity_type).toBe('community_ban')
    expect(found.community_slug).toBe(community.slug)
    expect(found.reason).toBe('API test violation')
  })

  it('does not return bans for other users', async () => {
    const other = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityBan({
      communityId: community.id,
      userId: other.id,
      bannedById: owner.id,
    })

    const freshUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(freshUser)

    const response = await request.get('/api/v1/my/bans').expect(200)
    const found = response.body.bans.find(
      (b: { community_id: string }) => b.community_id === community.id,
    )
    expect(found).toBeUndefined()
  })

  it('accepts a valid limit query param', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/bans?limit=10').expect(200)
    expect(Array.isArray(response.body.bans)).toBe(true)
  })

  it('accepts an after query param for pagination', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    // Just verify it doesn't error with a valid cursor from a first page
    const first = await request.get('/api/v1/my/bans?limit=1').expect(200)
    if (first.body.page_info.end_cursor) {
      const after = encodeURIComponent(first.body.page_info.end_cursor)
      await request.get(`/api/v1/my/bans?after=${after}`).expect(200)
    }
  })
})
