import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  getTestCommunityMember,
  addTestUserRole,
  getTestPrivateUserById,
} from '@voucha/test-helpers'
import type { Community, CommunityMember } from '@voucha/types/entities/community'
import { currentUserCanViewCommunityModlog } from './authorization.mts'

describe('currentUserCanViewCommunityModlog', () => {
  let community: Community

  beforeAll(async () => {
    const owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
  })

  it('returns true for admin users regardless of membership', async () => {
    const admin = await createTestUser({ administrator: true })
    expect(currentUserCanViewCommunityModlog(admin, community, null)).toBe(true)
  })

  it('returns true for site moderator users regardless of membership', async () => {
    let siteMod = await createTestUser()
    await addTestUserRole(siteMod.id, 'moderator')
    siteMod = (await getTestPrivateUserById(siteMod.id))!
    expect(currentUserCanViewCommunityModlog(siteMod, community, null)).toBe(true)
  })

  it('returns true for community owner', async () => {
    const user = await createTestUser()
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user.id,
      role: 'owner',
    })
    const membership = (await getTestCommunityMember(community.id, user.id)) as CommunityMember
    expect(currentUserCanViewCommunityModlog(user, community, membership)).toBe(true)
  })

  it('returns true for community moderator', async () => {
    const user = await createTestUser()
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user.id,
      role: 'moderator',
    })
    const membership = (await getTestCommunityMember(community.id, user.id)) as CommunityMember
    expect(currentUserCanViewCommunityModlog(user, community, membership)).toBe(true)
  })

  it('returns false for a regular community member', async () => {
    const user = await createTestUser()
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user.id,
      role: 'member',
    })
    const membership = (await getTestCommunityMember(community.id, user.id)) as CommunityMember
    expect(currentUserCanViewCommunityModlog(user, community, membership)).toBe(false)
  })

  it('returns false for a non-member user', async () => {
    const user = await createTestUser()
    expect(currentUserCanViewCommunityModlog(user, community, null)).toBe(false)
  })

  it('returns false when membership is removed', async () => {
    const user = await createTestUser()
    // Simulate a removed membership by passing a membership object with removed_at set
    const removedMembership = {
      community_id: community.id,
      user_id: user.id,
      role: 'moderator',
      removed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    } as unknown as CommunityMember
    expect(currentUserCanViewCommunityModlog(user, community, removedMembership)).toBe(false)
  })
})
