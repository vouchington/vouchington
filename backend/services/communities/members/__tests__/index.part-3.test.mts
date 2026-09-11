import { it, expect, beforeAll, describe } from 'vitest'

import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'

import { joinCommunity } from '../join.mts'

import { archiveCommunity } from '../../archive.mts'

import { leaveCommunity } from '../leave.mts'

import { updateMemberRole } from '../update-role.mts'

import { removeMember } from '../remove.mts'

import { getCommunityMember, searchCommunityMembers } from '../get.mts'

import { decodeCursor, encodeCursor, isNameCursor } from '@modules/pagination'

import type { PrivateUser } from '@services/users/types'

import type { Community } from '../../types.mts'

describe('index', () => {
  let owner: PrivateUser

  let publicCommunity: Community

  let privateCommunity: Community

  beforeAll(async () => {
    owner = await createTestUser()
    ;[publicCommunity, privateCommunity] = await Promise.all([
      insertTestCommunity({ createdById: owner.id, visibility: 'public' }),
      insertTestCommunity({ createdById: owner.id, visibility: 'private' }),
    ])
    // Add owner as member in both
    await Promise.all([
      insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: owner.id,
        role: 'owner',
      }),
      insertTestCommunityMember({
        communityId: privateCommunity.id,
        userId: owner.id,
        role: 'owner',
      }),
    ])
  })

  describe('removeMember', () => {
    it('owner can remove a member', async () => {
      const user = await createTestUser()
      await insertTestCommunityMember({ communityId: publicCommunity.id, userId: user.id })
      await removeMember(owner.id, publicCommunity.id, user.id)
      const membership = await getCommunityMember(publicCommunity.id, user.id)
      expect(membership).toBeNull()
    })

    it('cannot remove the owner', async () => {
      const mod = await createTestUser()
      await insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: mod.id,
        role: 'moderator',
      })
      await expect(removeMember(mod.id, publicCommunity.id, owner.id)).rejects.toMatchObject({
        status: 403,
      })
    })

    it('rejects removing members from an archived community', async () => {
      const target = await createTestUser()
      const archivedCommunity = await insertTestCommunity({
        createdById: owner.id,
        slug: `members-remove-archived-${Date.now()}`,
      })
      await Promise.all([
        insertTestCommunityMember({
          communityId: archivedCommunity.id,
          userId: owner.id,
          role: 'owner',
        }),
        insertTestCommunityMember({
          communityId: archivedCommunity.id,
          userId: target.id,
          role: 'member',
        }),
      ])
      await archiveCommunity(archivedCommunity.id, owner.id)

      await expect(removeMember(owner.id, archivedCommunity.id, target.id)).rejects.toMatchObject({
        status: 403,
        message: 'Community is archived',
      })
    })

    // Prompt-slot-deactivation side effect test relocated to
    // @services/community-agent-prompts/deactivate-on-membership-change.test.mts — see that file's
    // header comment for why (avoids recreating the communities<->community-agent-prompts cycle).
  })

  describe('searchCommunityMembers', () => {
    it('returns paginated members', async () => {
      const result = await searchCommunityMembers(publicCommunity.id, { limit: 10 })
      expect(result.results.length).toBeGreaterThan(0)
      expect(result.page_info).toBeDefined()
    })

    it('filters by role and accepts an after cursor', async () => {
      const community = await insertTestCommunity({ createdById: owner.id })
      const [moderatorBeforeCursor, moderatorAfterCursor, member] = await Promise.all([
        createTestUser(),
        createTestUser(),
        createTestUser(),
      ])
      const moderatorMemberships = await Promise.all([
        insertTestCommunityMember({
          communityId: community.id,
          userId: moderatorBeforeCursor!.id,
          role: 'moderator',
        }),
        insertTestCommunityMember({
          communityId: community.id,
          userId: moderatorAfterCursor!.id,
          role: 'moderator',
        }),
      ])
      await insertTestCommunityMember({
        communityId: community.id,
        userId: member!.id,
        role: 'member',
      })
      moderatorMemberships.sort((a, b) => a.id.localeCompare(b.id))
      const cursor = encodeCursor({
        name: moderatorMemberships[0]!.id,
        id: moderatorMemberships[0]!.id,
      })
      const decodedCursor = decodeCursor(cursor)
      if (!isNameCursor(decodedCursor)) throw new Error('expected NameCursor')

      const secondPage = await searchCommunityMembers(community.id, {
        after: cursor,
        limit: 10,
        role: 'moderator',
      })

      expect(secondPage.results.map(result => result.id)).toEqual([moderatorMemberships[1]!.id])
      expect(secondPage.results.every(result => result.id > decodedCursor.id)).toBe(true)
      expect(secondPage.results.every(result => result.role === 'moderator')).toBe(true)
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof joinCommunity)
  void (0 as unknown as typeof archiveCommunity)
  void (0 as unknown as typeof leaveCommunity)
  void (0 as unknown as typeof updateMemberRole)
})
