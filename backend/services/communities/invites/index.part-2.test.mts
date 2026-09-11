import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityInvite,
} from '@voucha/test-helpers'
import { searchInvites, getMyInvites } from './get.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '../types.mts'

describe('index', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  describe('searchInvites / getMyInvites', () => {
    it('searchInvites returns invites for a community', async () => {
      const result = await searchInvites(community.id)
      expect(result.results).toBeDefined()
      expect(result.page_info).toBeDefined()
    })

    it('getMyInvites returns invites for a user', async () => {
      const invitee = await createTestUser()
      await insertTestCommunityInvite({
        communityId: community.id,
        invitedById: owner.id,
        invitedUserId: invitee.id,
      })
      const invites = await getMyInvites(invitee.id)
      expect(invites.length).toBeGreaterThanOrEqual(1)
      expect(invites[0]!.invited_user_id).toBe(invitee.id)
    })
  })
})
