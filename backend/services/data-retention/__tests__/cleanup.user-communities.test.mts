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
import {
  getTestPurgeCommunity,
  setTestPurgeCommunityLifecycle,
} from '@voucha/test-helpers/user-purge-communities'
import { getCommunity } from '../../communities/get.mts'
import { getCommunityMember } from '../../communities/members/get.mts'
import { listNotifications } from '../../notifications/list.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'
import { dataRetentionConfig } from '../config.mts'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'

describe('community preservation during final user purge', () => {
  it('notifies one successor for every community transferred in the same transaction', async () => {
    const owner = await createTestUserDirect()
    const successor = await createTestUserDirect()
    const communities = await Promise.all(
      ['First succession', 'Second succession'].map(name =>
        insertTestCommunity({ createdById: owner.id, name }),
      ),
    )
    for (const community of communities) {
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: successor.id,
        role: 'moderator',
      })
    }
    const window = createTestRetentionWindow()
    await softDeleteUserAt(owner.id, window.firstEligibleDate)
    const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      community_purge_batch_size: 2,
    })
    try {
      await cleanupSoftDeletedUser(owner.id, window.upperBoundDate, undefined, 2, {
        remainingRows: 2,
      })
      const transfers = Object.values((await listNotifications(successor.id)).notifications).filter(
        notification => notification.entity_type === 'community_ownership_transfer',
      )
      expect(transfers).toEqual(
        expect.arrayContaining(
          communities.map(community =>
            expect.objectContaining({ title: `You now own ${community.name}` }),
          ),
        ),
      )
      expect(transfers).toHaveLength(2)
    } finally {
      restore()
    }
  })

  it('selects the oldest eligible active moderator in membership join order', async () => {
    const owner = await createTestUserDirect()
    const [first, second, newer, removed, deleted, suspended, member] = await Promise.all(
      Array.from({ length: 7 }, () => createTestUserDirect()),
    )
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member!.id,
      role: 'member',
    })
    for (const user of [removed!, deleted!, suspended!]) {
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'moderator',
      })
    }
    const memberships = []
    for (const user of [first!, second!]) {
      memberships.push(
        await insertTestCommunityMember({
          communityId: community.id,
          userId: user.id,
          role: 'moderator',
        }),
      )
    }
    await insertTestCommunityMember({
      communityId: community.id,
      userId: newer!.id,
      role: 'moderator',
    })
    await removeTestCommunityMember(community.id, removed!.id)
    const window = createTestRetentionWindow()
    await softDeleteUserAt(deleted!.id, window.firstEligibleDate)
    await suspendTestUser(suspended!.id)
    await softDeleteUserAt(owner.id, window.firstEligibleDate)
    const selected = memberships.toSorted((a, b) => a.id.localeCompare(b.id))[0]!
    const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      community_purge_batch_size: 1,
    })
    try {
      await expect(cleanupSoftDeletedUser(owner.id, window.upperBoundDate)).resolves.toMatchObject({
        deleted: 0,
        hasMore: true,
      })
      await expect(getCommunityMember(community.id, selected.user_id)).resolves.toMatchObject({
        role: 'owner',
      })
      await expect(cleanupSoftDeletedUser(owner.id, window.upperBoundDate)).resolves.toMatchObject({
        deleted: 1,
        hasMore: false,
      })
      await expect(getTestUserRaw(owner.id)).resolves.toBeNull()
      await expect(getCommunity(community.id)).resolves.toMatchObject({
        id: community.id,
        created_by_id: owner.id,
        owner: null,
      })
      await expect(getTestPurgeCommunity(community.id)).resolves.toMatchObject({
        archived_at: null,
      })
    } finally {
      restore()
    }
  })

  it('reports a post-commit delivery failure without stalling purge continuation', async () => {
    const owner = await createTestUserDirect()
    const successor = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: successor.id,
      role: 'moderator',
    })
    const window = createTestRetentionWindow()
    await softDeleteUserAt(owner.id, window.firstEligibleDate)

    const failure = await withPostgresPoolQueryFailureForTest('/* getPrivateUserByAny */', () =>
      cleanupSoftDeletedUser(owner.id, window.upperBoundDate),
    )

    expect(failure.result).toEqual({ deleted: 0, hasMore: true })
    await expect(getCommunityMember(community.id, successor.id)).resolves.toMatchObject({
      role: 'owner',
    })
    const transfers = Object.values((await listNotifications(successor.id)).notifications).filter(
      notification => notification.entity_type === 'community_ownership_transfer',
    )
    expect(transfers).toEqual([expect.objectContaining({ title: `You now own ${community.name}` })])
    expect(
      sentryCaptureExceptionMock.mock.calls.filter(([reported]) => reported === failure.error),
    ).toHaveLength(1)

    await expect(cleanupSoftDeletedUser(owner.id, window.upperBoundDate)).resolves.toMatchObject({
      deleted: 1,
      hasMore: false,
    })
    await expect(getTestUserRaw(owner.id)).resolves.toBeNull()
  })

  it.each(['archived', 'deleted'] as const)(
    'transfers an already %s community without changing its lifecycle',
    async lifecycle => {
      const owner = await createTestUserDirect()
      const moderator = await createTestUserDirect()
      const community = await insertTestCommunity({ createdById: owner.id })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role: 'owner',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      })
      await setTestPurgeCommunityLifecycle(community.id, lifecycle)
      const before = await getTestPurgeCommunity(community.id)
      const window = createTestRetentionWindow()
      await softDeleteUserAt(owner.id, window.firstEligibleDate)
      await cleanupSoftDeletedUser(owner.id, window.upperBoundDate)
      await cleanupSoftDeletedUser(owner.id, window.upperBoundDate)
      await expect(getTestPurgeCommunity(community.id)).resolves.toEqual(before)
      await expect(getCommunityMember(community.id, moderator.id)).resolves.toMatchObject({
        role: 'owner',
      })
    },
  )

  it('does not change current ownership when only the original creator is purged', async () => {
    const creator = await createTestUserDirect()
    const owner = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: creator.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const window = createTestRetentionWindow()
    await softDeleteUserAt(creator.id, window.firstEligibleDate)
    await expect(cleanupSoftDeletedUser(creator.id, window.upperBoundDate)).resolves.toMatchObject({
      deleted: 1,
    })
    await expect(getCommunityMember(community.id, owner.id)).resolves.toMatchObject({
      role: 'owner',
    })
    await expect(getTestPurgeCommunity(community.id)).resolves.toMatchObject({
      id: community.id,
      archived_at: null,
    })
  })
})
