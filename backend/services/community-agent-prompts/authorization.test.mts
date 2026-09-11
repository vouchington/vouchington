import { it, expect, describe } from 'vitest'
import {
  currentUserIsCommunityModerator,
  currentUserCanManageCommunityPrompts,
  currentUserCanViewCommunityModerationResults,
} from './authorization.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community, CommunityMember } from '@services/communities/types'
import type { Membership } from '@services/memberships/types'

function makeUser(overrides: Partial<PrivateUser> = {}): PrivateUser {
  return {
    id: 'user-1',
    username: 'testuser',
    roles: [],
    ...overrides,
  } as unknown as PrivateUser
}

function makeCommunity(overrides: Partial<Community> = {}): Community {
  return { id: 'community-1', created_by_id: 'owner-1', ...overrides } as unknown as Community
}

function makeMember(role: string): CommunityMember {
  return { role, removed_at: null } as unknown as CommunityMember
}

function makeMembership(
  plan: string,
  status = 'active',
  expiresAt: Date | null = null,
): Membership {
  return { plan, status, expires_at: expiresAt } as unknown as Membership
}

describe('currentUserIsCommunityModerator', () => {
  it('returns false for null user', () => {
    expect(currentUserIsCommunityModerator(null, makeCommunity(), null)).toBe(false)
  })

  it('returns true for administrator', () => {
    const admin = makeUser({ roles: ['administrator'] })
    expect(currentUserIsCommunityModerator(admin, makeCommunity(), null)).toBe(true)
  })

  it('does not retain moderator access for a former community creator without a current membership', () => {
    const creator = makeUser({ id: 'owner-1' })
    const community = makeCommunity({ created_by_id: 'owner-1' })
    expect(currentUserIsCommunityModerator(creator, community, null)).toBe(false)
  })

  it('returns true for owner member role', () => {
    const user = makeUser({ id: 'user-2' })
    expect(currentUserIsCommunityModerator(user, makeCommunity(), makeMember('owner'))).toBe(true)
  })

  it('returns true for moderator member role', () => {
    const user = makeUser({ id: 'user-2' })
    expect(currentUserIsCommunityModerator(user, makeCommunity(), makeMember('moderator'))).toBe(
      true,
    )
  })

  it('returns false for regular member', () => {
    const user = makeUser({ id: 'user-2' })
    expect(currentUserIsCommunityModerator(user, makeCommunity(), makeMember('member'))).toBe(false)
  })

  it('returns false for non-member (null membership)', () => {
    const user = makeUser({ id: 'user-2' })
    expect(currentUserIsCommunityModerator(user, makeCommunity(), null)).toBe(false)
  })
})

describe('currentUserCanManageCommunityPrompts', () => {
  it('returns false for null user', () => {
    expect(currentUserCanManageCommunityPrompts(null, makeCommunity(), null)).toBe(false)
  })

  it('returns true for administrator', () => {
    const admin = makeUser({ roles: ['administrator'] })
    expect(currentUserCanManageCommunityPrompts(admin, makeCommunity(), null)).toBe(true)
  })

  it('does not retain prompt-management access for community creator history', () => {
    const creator = makeUser({ id: 'owner-1' })
    expect(
      currentUserCanManageCommunityPrompts(
        creator,
        makeCommunity({ created_by_id: 'owner-1' }),
        null,
      ),
    ).toBe(false)
  })

  it('returns true for owner role', () => {
    const user = makeUser({ id: 'user-2' })
    expect(currentUserCanManageCommunityPrompts(user, makeCommunity(), makeMember('owner'))).toBe(
      true,
    )
  })

  it('returns true for moderator role', () => {
    const user = makeUser({ id: 'user-2' })
    expect(
      currentUserCanManageCommunityPrompts(user, makeCommunity(), makeMember('moderator')),
    ).toBe(true)
  })

  it('returns false for regular member', () => {
    const user = makeUser({ id: 'user-2' })
    expect(currentUserCanManageCommunityPrompts(user, makeCommunity(), makeMember('member'))).toBe(
      false,
    )
  })

  it('returns false for non-member', () => {
    const user = makeUser({ id: 'user-2' })
    expect(currentUserCanManageCommunityPrompts(user, makeCommunity(), null)).toBe(false)
  })
})

describe('currentUserCanViewCommunityModerationResults', () => {
  it('returns false for null user', () => {
    expect(currentUserCanViewCommunityModerationResults(null, makeCommunity(), null, null)).toBe(
      false,
    )
  })

  it('returns true for administrator', () => {
    const admin = makeUser({ roles: ['administrator'] })
    expect(currentUserCanViewCommunityModerationResults(admin, makeCommunity(), null, null)).toBe(
      true,
    )
  })

  it('does not retain transparency access for community creator history', () => {
    const creator = makeUser({ id: 'owner-1' })
    expect(
      currentUserCanViewCommunityModerationResults(
        creator,
        makeCommunity({ created_by_id: 'owner-1' }),
        null,
        null,
      ),
    ).toBe(false)
  })

  it('returns true for owner member', () => {
    const user = makeUser({ id: 'user-2' })
    expect(
      currentUserCanViewCommunityModerationResults(
        user,
        makeCommunity(),
        makeMember('owner'),
        null,
      ),
    ).toBe(true)
  })

  it('returns true for moderator member', () => {
    const user = makeUser({ id: 'user-2' })
    expect(
      currentUserCanViewCommunityModerationResults(
        user,
        makeCommunity(),
        makeMember('moderator'),
        null,
      ),
    ).toBe(true)
  })

  it('returns true for Plus member with active plus membership', () => {
    const user = makeUser({ id: 'user-2' })
    const membership = makeMember('member')
    const activeMembership = makeMembership('plus')
    expect(
      currentUserCanViewCommunityModerationResults(
        user,
        makeCommunity(),
        membership,
        activeMembership,
      ),
    ).toBe(true)
  })

  it('returns false for Plus member with paused membership', () => {
    const user = makeUser({ id: 'user-2' })
    const membership = makeMember('member')
    const pausedMembership = makeMembership('plus', 'paused')
    expect(
      currentUserCanViewCommunityModerationResults(
        user,
        makeCommunity(),
        membership,
        pausedMembership,
      ),
    ).toBe(false)
  })

  it('returns false for Plus member with expired membership', () => {
    const user = makeUser({ id: 'user-2' })
    expect(
      currentUserCanViewCommunityModerationResults(
        user,
        makeCommunity(),
        makeMember('member'),
        makeMembership('plus', 'active', new Date(0)),
      ),
    ).toBe(false)
  })

  it('returns false for regular member with no paid membership', () => {
    const user = makeUser({ id: 'user-2' })
    expect(
      currentUserCanViewCommunityModerationResults(
        user,
        makeCommunity(),
        makeMember('member'),
        null,
      ),
    ).toBe(false)
  })

  it('returns false for non-member even with paid membership', () => {
    const user = makeUser({ id: 'user-2' })
    expect(
      currentUserCanViewCommunityModerationResults(
        user,
        makeCommunity(),
        null,
        makeMembership('plus'),
      ),
    ).toBe(false)
  })

  it('returns false for removed member with paid membership', () => {
    const user = makeUser({ id: 'user-2' })
    const removedMembership = {
      role: 'member',
      removed_at: new Date(),
    } as unknown as CommunityMember
    expect(
      currentUserCanViewCommunityModerationResults(
        user,
        makeCommunity(),
        removedMembership,
        makeMembership('plus'),
      ),
    ).toBe(false)
  })
})
