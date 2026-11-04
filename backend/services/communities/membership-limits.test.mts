import { describe, expect, it, onTestFinished } from 'vitest'
import {
  beginTransaction,
  WEB_PROVENANCE,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityInvite,
  insertTestCommunityMember,
  getTestCommunityInviteStorage,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { communityMembershipLimitsConfig } from './membership-limits.mts'
import { joinCommunity } from './members/join.mts'
import { insertApprovedCommunityMember } from './members/insert-approved.mts'
import { updateMemberRole } from './members/update-role.mts'
import { getCommunityMember } from './members/get.mts'
import { redeemInviteCode } from './invites/redeem.mts'
import { createCommunity } from './create.mts'
import { getCommunity } from './get.mts'
import { initiateOwnershipTransfer } from './ownership-transfer.mts'

describe('community membership admission limits', () => {
  it('rejects join, approval, invite redemption and creation at the membership cap, including staff', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communityMembershipLimitsConfig, {
        communities_per_user: 1,
      }),
    )
    const user = await createTestUser({ administrator: true })
    const owner = await createTestUser()
    const first = await insertTestCommunity({ createdById: owner.id })
    const target = await insertTestCommunity({ createdById: owner.id, visibility: 'public' })
    await insertTestCommunityMember({ communityId: first.id, userId: user.id })
    const failure = { status: 409, code: 'COMMUNITY_MEMBERSHIP_LIMIT_REACHED' }
    await expect(joinCommunity(user.id, target)).rejects.toMatchObject(failure)
    {
      await using query = await beginTransaction()
      await expect(
        insertApprovedCommunityMember(target.id, user.id, owner.id, { query }),
      ).rejects.toMatchObject(failure)
    }
    const invite = await insertTestCommunityInvite({
      communityId: target.id,
      invitedById: owner.id,
      invitedUserId: user.id,
    })
    await expect(redeemInviteCode(user.id, invite.code)).rejects.toMatchObject(failure)
    expect((await getTestCommunityInviteStorage(invite.id))?.accepted_at).toBeNull()
    const slug = `capped-${crypto.randomUUID()}`
    await expect(
      createCommunity(user.id, WEB_PROVENANCE, { name: 'Capped community creation', slug }),
    ).rejects.toMatchObject(failure)
    expect(await getCommunity(slug)).toBeNull()
    expect(await getCommunityMember(target.id, user.id)).toBeNull()
  })

  it('serializes simultaneous joins across communities at the user limit', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communityMembershipLimitsConfig, {
        communities_per_user: 1,
      }),
    )
    const user = await createTestUser()
    const first = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
    const second = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
    const results = await Promise.allSettled([
      joinCommunity(user.id, first),
      joinCommunity(user.id, second),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({
      reason: { status: 409, code: 'COMMUNITY_MEMBERSHIP_LIMIT_REACHED' },
    })
    const members = await Promise.all([
      getCommunityMember(first.id, user.id),
      getCommunityMember(second.id, user.id),
    ])
    expect(members.filter(Boolean)).toHaveLength(1)
  })

  it('allows idempotent approval for an existing member after the limit is lowered', async () => {
    const user = await createTestUser()
    const first = await insertTestCommunity({ createdById: user.id })
    const second = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: first.id, userId: user.id })
    await insertTestCommunityMember({ communityId: second.id, userId: user.id })
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communityMembershipLimitsConfig, {
        communities_per_user: 1,
      }),
    )
    await using query = await beginTransaction()
    await insertApprovedCommunityMember(first.id, user.id, user.id, { query })
    await query.commit()
    expect(await getCommunityMember(first.id, user.id)).toMatchObject({ role: 'member' })
  })

  it('counts owners and serializes concurrent moderator promotions', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communityMembershipLimitsConfig, {
        moderators_per_community: 2,
      }),
    )
    const owner = await createTestUser()
    const first = await createTestUser()
    const second = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({ communityId: community.id, userId: first.id })
    await insertTestCommunityMember({ communityId: community.id, userId: second.id })
    const results = await Promise.allSettled([
      updateMemberRole(owner.id, community, first.id, 'moderator'),
      updateMemberRole(owner.id, community, second.id, 'moderator'),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({
      reason: { status: 409, code: 'COMMUNITY_MODERATOR_LIMIT_REACHED' },
    })
    const firstMember = await getCommunityMember(community.id, first.id)
    const moderatorId = firstMember?.role === 'moderator' ? first.id : second.id
    // Lowering admission limits permits no-op role updates and ownership swaps.
    onTestFinished(
      overrideDynamicConfigFieldsForTest(communityMembershipLimitsConfig, {
        moderators_per_community: 1,
      }),
    )
    await updateMemberRole(owner.id, community, moderatorId, 'moderator')
    await initiateOwnershipTransfer(owner.id, community, moderatorId)
    expect(await getCommunityMember(community.id, moderatorId)).toMatchObject({ role: 'owner' })
    expect(await getCommunityMember(community.id, owner.id)).toMatchObject({ role: 'moderator' })
  })
})
