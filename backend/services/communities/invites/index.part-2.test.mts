import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityInvite,
} from '@voucha/test-helpers'
import { searchInvites } from './get.mts'
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

  describe('searchInvites', () => {
    it('returns the community invite without its code or hash', async () => {
      const invitee = await createTestUser()
      const invite = await insertTestCommunityInvite({
        communityId: community.id,
        invitedById: owner.id,
        invitedUserId: invitee.id,
      })
      const result = await searchInvites(community.id)
      const listed = result.results.find(row => row.id === invite.id)
      expect(listed?.invited_user_id).toBe(invitee.id)
      expect(listed).not.toHaveProperty('code')
      expect(listed).not.toHaveProperty('code_hash')
    })
  })
})
