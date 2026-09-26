import { caches } from '@services/entity-cache/caches'
import { approveApplication } from '@services/communities/applications/review'
import { createApplication } from '@services/communities/applications/create'
import { banUserFromCommunity } from '@services/communities/bans/create'
import { createCommunity } from '@services/communities/create'
import { deleteCommunity } from '@services/communities/delete'
import { createInvite } from '@services/communities/invites/create'
import { redeemInviteCode } from '@services/communities/invites/redeem'
import { joinCommunity } from '@services/communities/members/join'
import { leaveCommunity } from '@services/communities/members/leave'
import { removeMember } from '@services/communities/members/remove'
import { updateMemberRole } from '@services/communities/members/update-role'
import type { CommunityMember } from '@services/communities/types'
import { updateCommunity } from '@services/communities/update'
import type { PrivateUser, UserMetrics } from '@services/users/types'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  pollUntilNotNull,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { getUserMetricsByAnyCached } from './metrics.mts'

describe('community membership user metrics invalidation', () => {
  it('invalidates metrics when creating a community owner membership', async () => {
    const user = await createTestUser()
    await expectCommunityCount(user, 0)

    await createCommunity(WEB_PROVENANCE, user.id, {
      name: `Metrics Community ${crypto.randomUUID()}`,
    })

    await expectMetricsInvalidated(user)
    await expectCommunityCount(user, 1)
  })

  it('invalidates metrics when joining a public community', async () => {
    const { communityId, owner } = await createOwnedCommunity()
    const user = await createTestUser()
    await expectCommunityCount(user, 0)

    await joinCommunity(user.id, communityId)

    await expectMetricsInvalidated(user)
    await expectCommunityCount(user, 1)
    expect(owner.id).not.toBe(user.id)
  })

  it('invalidates metrics when redeeming a community invite', async () => {
    const { communityId, owner } = await createOwnedCommunity()
    const user = await createTestUser()
    const invite = await createInvite(owner.id, communityId, { username: user.username! })
    await expectCommunityCount(user, 0)

    await redeemInviteCode(user.id, invite.code)

    await expectMetricsInvalidated(user)
    await expectCommunityCount(user, 1)
  })

  it('invalidates metrics when approving a community application', async () => {
    const { communityId, owner } = await createOwnedCommunity('private')
    const user = await createTestUser()
    const application = await createApplication(WEB_PROVENANCE, user.id, communityId, {})
    await expectCommunityCount(user, 0)

    await approveApplication(owner, application.id)

    await expectMetricsInvalidated(user)
    await expectCommunityCount(user, 0)
  })

  it('invalidates metrics when leaving a community', async () => {
    const { communityId } = await createOwnedCommunity()
    const user = await createTestUser()
    await insertTestCommunityMember({ communityId, userId: user.id })
    await expectCommunityCount(user, 1)

    await leaveCommunity(user.id, communityId)

    await expectMetricsInvalidated(user)
    await expectCommunityCount(user, 0)
  })

  it('invalidates metrics when a moderator removes a member', async () => {
    const { communityId, owner } = await createOwnedCommunity()
    const user = await createTestUser()
    await insertTestCommunityMember({ communityId, userId: user.id })
    await expectCommunityCount(user, 1)

    await removeMember(owner.id, communityId, user.id)

    await expectMetricsInvalidated(user)
    await expectCommunityCount(user, 0)
  })

  it('invalidates metrics when a community ban removes a member', async () => {
    const { communityId, owner } = await createOwnedCommunity()
    const user = await createTestUser()
    await insertTestCommunityMember({ communityId, userId: user.id })
    await expectCommunityCount(user, 1)

    await banUserFromCommunity(owner, communityId, user.id)

    await expectMetricsInvalidated(user)
    await expectCommunityCount(user, 0)
  })

  it('invalidates metrics when a role change alters hidden-roster visibility', async () => {
    const { communityId, owner } = await createOwnedCommunity('public', 'users')
    const user = await createTestUser()
    await insertTestCommunityMember({ communityId, userId: user.id })
    await expectCommunityCount(user, 0)

    await updateMemberRole(owner.id, communityId, user.id, 'moderator')

    await expectMetricsInvalidated(user)
    await expectCommunityCount(user, 1)
  })

  it('invalidates member metrics when community visibility changes', async () => {
    const { communityId, owner, ownerMembership } = await createOwnedCommunity()
    const user = await createTestUser()
    await insertTestCommunityMember({ communityId, userId: user.id })
    await expectCommunityCount(user, 1)

    await updateCommunity(owner, communityId, { visibility: 'private' }, ownerMembership)

    await expectMetricsInvalidated(user)
    await expectCommunityCount(user, 0)
  })

  it('invalidates regular-member metrics when roster visibility changes', async () => {
    const { communityId, owner, ownerMembership } = await createOwnedCommunity()
    const user = await createTestUser()
    await insertTestCommunityMember({ communityId, userId: user.id })
    await expectCommunityCount(user, 1)

    await updateCommunity(
      owner,
      communityId,
      { member_roster_visibility: 'users' },
      ownerMembership,
    )

    await expectMetricsInvalidated(user)
    await expectCommunityCount(user, 0)
  })

  it('invalidates member metrics when a community is deleted', async () => {
    const { communityId, owner, ownerMembership } = await createOwnedCommunity()
    const user = await createTestUser()
    await insertTestCommunityMember({ communityId, userId: user.id })
    await expectCommunityCount(user, 1)

    await deleteCommunity(owner, communityId, ownerMembership)

    await expectMetricsInvalidated(user)
    await expectCommunityCount(user, 0)
  })
})

async function createOwnedCommunity(
  visibility: 'public' | 'private' = 'public',
  memberRosterVisibility: 'public' | 'users' | 'members' | 'moderators' = 'public',
): Promise<{ communityId: string; owner: PrivateUser; ownerMembership: CommunityMember }> {
  const owner = await createTestUser()
  const community = await insertTestCommunity({
    createdById: owner.id,
    visibility,
    member_roster_visibility: memberRosterVisibility,
  })
  const ownerMembership = await insertTestCommunityMember({
    communityId: community.id,
    userId: owner.id,
    role: 'owner',
  })
  return { communityId: community.id, owner, ownerMembership }
}

async function expectCommunityCount(user: PrivateUser, count: number): Promise<UserMetrics> {
  const metrics = await getUserMetricsByAnyCached(user.id)
  expect(metrics?.count.communities_member).toBe(count)
  await Promise.all([
    pollUntilNotNull(() => caches.user_metrics.get(user.id)),
    pollUntilNotNull(() => caches.user_metrics.get(user.username!)),
  ])
  return metrics!
}

async function expectMetricsInvalidated(user: PrivateUser): Promise<void> {
  expect(await caches.user_metrics.get(user.id)).toBeNull()
  expect(await caches.user_metrics.get(user.username!)).toBeNull()
}
