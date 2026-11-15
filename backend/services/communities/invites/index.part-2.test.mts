import { it, expect, beforeAll, describe } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityInvite,
} from '@voucha/test-helpers'
import { searchInvites } from './get.mts'
import { createInvite } from './create.mts'
import { redeemInviteCode } from './redeem.mts'
import { loadCommunityWithViewer } from '../load-with-viewer.mts'
import { getCommunityMember } from '../members/get.mts'
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

  it('reinviting an email rotates the sole pending invite code', async () => {
    const invitee = await createTestUser()
    const first = await createInvite(
      owner.id,
      (await loadCommunityWithViewer(community.id, owner.id))!,
      { email: invitee.email_address! },
    )
    const second = await createInvite(
      owner.id,
      (await loadCommunityWithViewer(community.id, owner.id))!,
      {
        email: invitee.email_address!.toUpperCase(),
      },
    )
    expect(second.id).toBe(first.id)
    expect(second.code).not.toBe(first.code)
    await expect(redeemInviteCode(invitee.id, first.code)).rejects.toMatchObject({ status: 404 })
    const redeemed = await redeemInviteCode(invitee.id, second.code)
    expect(redeemed.accepted_by_id).toBe(invitee.id)
    expect(await getCommunityMember(community.id, invitee.id)).not.toBeNull()
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
