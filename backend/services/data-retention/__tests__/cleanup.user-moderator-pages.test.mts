import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
  removeTestCommunityMember,
  softDeleteUserAt,
  suspendTestUser,
  getTestUserRaw,
  createTestRetentionWindow,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getTestPurgeCommunity } from '@voucha/test-helpers/user-purge-communities'
import { createUserDeletionRequest } from '../../user-deletions/create.mts'
import { getCommunityMember } from '../../communities/members/get.mts'
import { listNotifications } from '../../notifications/list.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'
import { cleanupSoftDeletedUsers } from '../cleanup.mts'
import type { UserPurgeCursor } from '../user-purge-types.mts'
import { dataRetentionConfig } from '../config.mts'

describe('bounded moderator scan continuation', () => {
  it('resumes past suspended and pending-deletion moderators before notifying the oldest eligible successor', async () => {
    const owner = await createTestUserDirect()
    const suspended = await createTestUserDirect()
    const deleting = await createTestUserDirect()
    const successor = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const memberships = []
    for (const user of [suspended, deleting, successor]) {
      memberships.push(
        await insertTestCommunityMember({
          communityId: community.id,
          userId: user.id,
          role: 'moderator',
        }),
      )
    }
    await suspendTestUser(suspended.id)
    await createUserDeletionRequest(deleting.id, deleting.id)
    const window = createTestRetentionWindow()
    await softDeleteUserAt(owner.id, window.firstEligibleDate)
    const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      community_moderator_scan_page_size: 1,
    })
    const run = (cursor?: UserPurgeCursor) =>
      cleanupSoftDeletedUser(
        owner.id,
        window.upperBoundDate,
        undefined,
        1,
        { remainingRows: 1 },
        cursor,
      )
    try {
      const first = await run()
      expect(first.userPurge).toEqual({
        userId: owner.id,
        communityId: community.id,
        afterModeratorId: memberships[0]!.id,
      })
      const second = await run(first.userPurge)
      expect(second.userPurge?.afterModeratorId).toBe(memberships[1]!.id)
      await expect(getTestPurgeCommunity(community.id)).resolves.toMatchObject({
        archived_at: null,
      })
      await expect(getCommunityMember(community.id, owner.id)).resolves.toMatchObject({
        role: 'owner',
      })
      await expect(getTestUserRaw(owner.id)).resolves.not.toBeNull()
      const transferred = await run(second.userPurge)
      expect(transferred).toEqual({ deleted: 0, hasMore: true })
      await expect(getCommunityMember(community.id, successor.id)).resolves.toMatchObject({
        role: 'owner',
      })
      const notices = Object.values((await listNotifications(successor.id)).notifications)
      expect(
        notices.filter(notification => notification.entity_type === 'community_ownership_transfer'),
      ).toEqual([expect.objectContaining({ title: `You now own ${community.name}` })])
      expect(Object.values((await listNotifications(owner.id)).notifications)).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ entity_type: 'community_ownership_transfer' }),
        ]),
      )
      await run()
      await run()
      await expect(getTestUserRaw(owner.id)).resolves.toBeNull()
    } finally {
      restore()
    }
  })

  it('requires an empty continuation after an exactly full ineligible page before archiving', async () => {
    const owner = await createTestUserDirect()
    const moderator = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    await createUserDeletionRequest(moderator.id, moderator.id)
    const window = createTestRetentionWindow()
    await softDeleteUserAt(owner.id, window.firstEligibleDate)
    const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      community_moderator_scan_page_size: 1,
    })
    try {
      const first = await cleanupSoftDeletedUser(owner.id, window.upperBoundDate)
      expect(first.userPurge).toBeDefined()
      await expect(getTestPurgeCommunity(community.id)).resolves.toMatchObject({
        archived_at: null,
      })
      await cleanupSoftDeletedUser(
        owner.id,
        window.upperBoundDate,
        undefined,
        1,
        { remainingRows: 1 },
        first.userPurge,
      )
      await expect(getTestPurgeCommunity(community.id)).resolves.toMatchObject({
        archived_at: expect.any(Date),
      })
    } finally {
      restore()
    }
  })

  it('clears a stale community cursor without draining another still-owned community', async () => {
    const owner = await createTestUserDirect()
    const moderator = await createTestUserDirect()
    const first = await insertTestCommunity({ createdById: owner.id })
    const second = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: first.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({ communityId: second.id, userId: owner.id, role: 'owner' })
    const member = await insertTestCommunityMember({
      communityId: first.id,
      userId: moderator.id,
      role: 'moderator',
    })
    await createUserDeletionRequest(moderator.id, moderator.id)
    const window = createTestRetentionWindow()
    await softDeleteUserAt(owner.id, window.firstEligibleDate)
    await removeTestCommunityMember(first.id, owner.id)
    const result = await cleanupSoftDeletedUser(
      owner.id,
      window.upperBoundDate,
      undefined,
      1,
      { remainingRows: 1 },
      { userId: owner.id, communityId: first.id, afterModeratorId: member.id },
    )
    expect(result).toEqual({ deleted: 0, hasMore: true })
    await expect(getCommunityMember(second.id, owner.id)).resolves.toMatchObject({ role: 'owner' })
    await expect(getTestPurgeCommunity(second.id)).resolves.toMatchObject({ archived_at: null })
    await cleanupSoftDeletedUser(owner.id, window.upperBoundDate)
    await expect(getTestPurgeCommunity(second.id)).resolves.toMatchObject({
      archived_at: expect.any(Date),
    })
  })

  it('resumes global discovery when the cursor user is no longer eligible', async () => {
    const user = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: user.id })
    const window = createTestRetentionWindow()
    await softDeleteUserAt(user.id, new Date())
    await expect(
      cleanupSoftDeletedUsers({
        ...window,
        batchSize: 1,
        maxBatches: 1,
        userPurge: { userId: user.id, communityId: community.id, afterModeratorId: community.id },
      }),
    ).resolves.toEqual({ deleted: 0, hasMore: true })
    await expect(getTestUserRaw(user.id)).resolves.not.toBeNull()
  })
})
