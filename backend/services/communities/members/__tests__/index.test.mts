import { it, expect, beforeAll, describe } from 'vitest'

import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'

import { archiveCommunity } from '../../archive.mts'
import { joinCommunity } from '../join.mts'

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

  describe('joinCommunity', () => {
    it('user can join a public community', async () => {
      const user = await createTestUser()
      const member = await joinCommunity(user.id, publicCommunity.id)
      expect(member.user_id).toBe(user.id)
      expect(member.community_id).toBe(publicCommunity.id)
      expect(member.role).toBe('member')
    })

    it('rejects joining a private community directly', async () => {
      const user = await createTestUser()
      await expect(joinCommunity(user.id, privateCommunity.id)).rejects.toMatchObject({
        status: 403,
      })
    })

    it('rejects joining an archived community', async () => {
      const archivedComm = await insertTestCommunity({ createdById: owner.id })
      await insertTestCommunityMember({
        communityId: archivedComm.id,
        userId: owner.id,
        role: 'owner',
      })
      await archiveCommunity(archivedComm.id, null)
      const user = await createTestUser()
      await expect(joinCommunity(user.id, archivedComm.id)).rejects.toMatchObject({ status: 403 })
    })

    it('rejects joining if already a member', async () => {
      const user = await createTestUser()
      await joinCommunity(user.id, publicCommunity.id)
      await expect(joinCommunity(user.id, publicCommunity.id)).rejects.toMatchObject({
        status: 409,
      })
    })
  })

  describe('leaveCommunity', () => {
    it('member can leave a community', async () => {
      const user = await createTestUser()
      await insertTestCommunityMember({ communityId: publicCommunity.id, userId: user.id })
      await leaveCommunity(user.id, publicCommunity.id)
      const membership = await getCommunityMember(publicCommunity.id, user.id)
      expect(membership).toBeNull()
    })

    it('owner cannot leave the community', async () => {
      await expect(leaveCommunity(owner.id, publicCommunity.id)).rejects.toMatchObject({
        status: 422,
      })
    })

    it('rejects leaving a community the user is not in', async () => {
      const user = await createTestUser()
      await expect(leaveCommunity(user.id, publicCommunity.id)).rejects.toMatchObject({
        status: 404,
      })
    })

    it('rejects leaving an archived community', async () => {
      const archivedCommunity = await insertTestCommunity({
        createdById: owner.id,
        slug: `members-leave-archived-${Date.now()}`,
      })
      const user = await createTestUser()
      await Promise.all([
        insertTestCommunityMember({
          communityId: archivedCommunity.id,
          userId: owner.id,
          role: 'owner',
        }),
        insertTestCommunityMember({
          communityId: archivedCommunity.id,
          userId: user.id,
          role: 'member',
        }),
      ])
      await archiveCommunity(archivedCommunity.id, owner.id)

      await expect(leaveCommunity(user.id, archivedCommunity.id)).rejects.toMatchObject({
        status: 403,
        message: 'Community is archived',
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof updateMemberRole)
  void (0 as unknown as typeof removeMember)
  void (0 as unknown as typeof searchCommunityMembers)
  // keep generated shard import bindings live for typecheck
  void (0 as unknown as typeof decodeCursor)
  void (0 as unknown as typeof encodeCursor)
  void (0 as unknown as typeof isNameCursor)
})
