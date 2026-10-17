import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  getTestBanEvasionFlagState,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '@services/communities/types'
import { detectBanEvasionForMember } from '@services/communities/ban-evasion'

describe('detectBanEvasionForMember (worker)', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  it('processes a job for a member with no posts and returns without flagging', async () => {
    const member = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })

    await expect(detectBanEvasionForMember(community.id, member.id)).resolves.toMatchObject({
      flagged: false,
    })

    const flagState = await getTestBanEvasionFlagState(community.id, member.id)
    expect(flagState?.suspected_ban_evader_at).toBeNull()
  })

  it('handles a non-existent member gracefully (member removed)', async () => {
    const nonMember = await createTestUser()
    // Not a member — should return without error
    await expect(detectBanEvasionForMember(community.id, nonMember.id)).resolves.toMatchObject({
      flagged: false,
    })
  })
})
