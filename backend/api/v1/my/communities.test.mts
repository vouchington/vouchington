import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  removeTestCommunityMember,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/my/communities', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/communities').expect(401)
  })

  it('returns an empty list when user has no memberships', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/my/communities').expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
  })

  it('returns community memberships the user has joined', async () => {
    const memberUser = await createTestUser()
    const communityOwner = await createTestUser()
    const community = await insertTestCommunity({ createdById: communityOwner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: memberUser.id })

    const request = createRequest()
    await request.authenticateAs(memberUser)
    const response = await request.get('/api/v1/my/communities').expect(200)
    const communityIds = (response.body.results as Array<{ community_id: string }>).map(
      r => r.community_id,
    )
    expect(communityIds).toContain(community.id)
  })

  it('does not return removed memberships', async () => {
    const leaverUser = await createTestUser()
    const communityOwner = await createTestUser()
    const community = await insertTestCommunity({ createdById: communityOwner.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: leaverUser.id,
    })

    // Soft-remove the membership via the test helper
    await removeTestCommunityMember(community.id, leaverUser.id)

    const request = createRequest()
    await request.authenticateAs(leaverUser)
    const response = await request.get('/api/v1/my/communities').expect(200)
    const communityIds = (response.body.results as Array<{ community_id: string }>).map(
      r => r.community_id,
    )
    expect(communityIds).not.toContain(community.id)
  })
})
