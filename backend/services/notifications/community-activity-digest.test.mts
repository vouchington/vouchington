import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  deleteTestNotificationPushIntent,
  getTestNotificationPushIntent,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  insertTestCommunityVacation,
  archiveTestCommunity,
  removeTestCommunityMember,
  softDeleteUser,
  suspendTestUser,
  setTestCommunityDigestVacationSuppression,
} from '@voucha/test-helpers'
import {
  createCommunityActivityDigestBatch,
  getPreviousClosedMondayWindow,
} from './community-activity-digest.mts'
import { deleteNotification } from './mutations.mts'
import { listNotifications } from './list.mts'
import { buildCommunityActivityDigestBody } from './community-activity-digest-body.mts'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'

type DigestInput = { windowStart: Date; windowEnd: Date }

async function runDigestBatchForUser(userId: string, input: DigestInput) {
  const compact = userId.replaceAll('-', '')
  const previous = (BigInt(`0x${compact}`) - 1n).toString(16).padStart(32, '0')
  const afterUserId = [8, 12, 16, 20].reduce(
    (value, offset, index) => `${value.slice(0, offset + index)}-${value.slice(offset + index)}`,
    previous,
  )
  return await createCommunityActivityDigestBatch({ ...input, afterUserId })
}

describe('community activity digest', () => {
  it('returns the previous closed Monday-to-Monday UTC window', () => {
    expect(getPreviousClosedMondayWindow(new Date('2026-07-15T18:42:00Z'))).toEqual({
      start: new Date('2026-07-06T00:00:00Z'),
      end: new Date('2026-07-13T00:00:00Z'),
    })
  })

  it('skips recipients with no activity in the window', async () => {
    const owner = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const future = new Date(Date.now() + 86_400_000)

    const result = await runDigestBatchForUser(owner.id, {
      windowStart: future,
      windowEnd: new Date(future.getTime() + 3_600_000),
    })

    expect(result.created).not.toContainEqual(expect.objectContaining({ userId: owner.id }))
    expect((await listNotifications(owner.id)).results).toHaveLength(0)
  })

  it('combines active communities and excludes inactive communities from every aggregate', async () => {
    const owner = await createTestUserDirect()
    const active = await insertTestCommunity({ createdById: owner.id })
    const inactive = await insertTestCommunity({ createdById: owner.id })
    const now = new Date()
    const start = new Date(now.getTime() - 3_600_000)
    const end = new Date(now.getTime() + 3_600_000)
    await insertTestCommunityMember({
      communityId: active.id,
      userId: owner.id,
      role: 'owner',
      createdAt: now,
    })
    await insertTestCommunityMember({
      communityId: inactive.id,
      userId: owner.id,
      role: 'owner',
      createdAt: new Date(start.getTime() - 86_400_000),
    })

    const result = await runDigestBatchForUser(owner.id, { windowStart: start, windowEnd: end })
    const own = result.created.filter(item => item.userId === owner.id)
    expect(own).toHaveLength(1)
    const notification = (await listNotifications(owner.id)).notifications[own[0]!.notificationId]
    expect(notification?.body).toContain('1 community: 1 joined')
    expect(notification?.body).toContain('1 total active members')
  })

  it('returns an existing unpushed row on retry and never recreates a dismissed digest', async () => {
    const owner = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: owner.id })
    const now = new Date()
    const input = {
      windowStart: new Date(now.getTime() - 3_600_000),
      windowEnd: new Date(now.getTime() + 3_600_000),
    }
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
      createdAt: now,
    })

    const first = await runDigestBatchForUser(owner.id, input)
    const firstRow = first.created.find(item => item.userId === owner.id)!
    await deleteTestNotificationPushIntent(owner.id, firstRow.notificationId)
    await expect(
      getTestNotificationPushIntent(owner.id, firstRow.notificationId),
    ).resolves.toBeUndefined()
    const retry = await runDigestBatchForUser(owner.id, input)
    expect(retry.created.find(item => item.userId === owner.id)).toEqual(firstRow)
    await expect(
      getTestNotificationPushIntent(owner.id, firstRow.notificationId),
    ).resolves.toMatchObject({ status: 'pending' })
    expect((await listNotifications(owner.id)).results).toHaveLength(1)

    await deleteNotification(owner.id, firstRow.notificationId)
    const afterDismissal = await runDigestBatchForUser(owner.id, input)
    expect(afterDismissal.created).not.toContainEqual(expect.objectContaining({ userId: owner.id }))
    expect((await listNotifications(owner.id)).results).toHaveLength(0)
  })

  it('counts post types and selects an older discussion with direct replies in the window', async () => {
    const owner = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: owner.id })
    const now = new Date()
    const start = new Date(now.getTime() - 3_600_000)
    const end = new Date(now.getTime() + 3_600_000)
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
      createdAt: new Date(start.getTime() - 86_400_000),
    })
    const discussionId = await insertTestPost({
      title: 'Top discussion',
      slug: `older-top-${owner.id}`,
      markdown: 'Discussion',
      createdById: owner.id,
      communityId: community.id,
      createdAt: new Date(start.getTime() - 86_400_000),
    })
    await Promise.all([
      insertTestPost({
        title: 'Reply',
        slug: `reply-${owner.id}`,
        markdown: 'Reply',
        postType: 'comment',
        createdById: owner.id,
        communityId: community.id,
        rootId: discussionId,
        parentId: discussionId,
        createdAt: now,
      }),
      insertTestPost({
        title: 'Review',
        slug: `review-${owner.id}`,
        markdown: 'Review',
        postType: 'review',
        createdById: owner.id,
        communityId: community.id,
        createdAt: now,
      }),
      insertTestPost({
        title: 'Data',
        slug: `data-${owner.id}`,
        markdown: 'Data',
        postType: 'data_point',
        createdById: owner.id,
        communityId: community.id,
        createdAt: now,
      }),
    ])

    const result = await runDigestBatchForUser(owner.id, { windowStart: start, windowEnd: end })
    const row = result.created.find(item => item.userId === owner.id)!
    const notification = (await listNotifications(owner.id)).notifications[row.notificationId]
    expect(notification?.body).toContain('0 discussions, 1 reviews, 1 data points, 1 comments')
    expect(notification?.body).toContain('Top discussion (1 replies)')
  })

  it('omits an unavailable top discussion and caps the body at the notification limit', () => {
    const body = buildCommunityActivityDigestBody({
      community_count: 1,
      joins: 0,
      departures: 0,
      discussions: 0,
      reviews: 0,
      data_points: 0,
      comments: 1,
      active_posters: 1,
      active_members: 1,
      moderation_workload: 0,
      top_discussion: null,
    })
    expect(body).not.toContain('top discussion')
    expect(body.length).toBeLessThanOrEqual(1000)
  })

  it.each([
    { role: 'owner', suppress: true, expired: false, delivered: false },
    { role: 'moderator', suppress: true, expired: false, delivered: false },
    { role: 'moderator', suppress: false, expired: false, delivered: true },
    { role: 'owner', suppress: true, expired: true, delivered: true },
  ] as const)(
    'role=$role suppress=$suppress expired=$expired delivers=$delivered',
    async options => {
      const { role, suppress, expired, delivered } = options
      const owner = await createTestUserDirect()
      const community = await insertTestCommunity({ createdById: owner.id })
      const now = new Date()
      const start = new Date(now.getTime() - 3_600_000)
      const end = new Date(now.getTime() + 3_600_000)
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner.id,
        role,
        createdAt: now,
      })
      await setTestCommunityDigestVacationSuppression(community.id, owner.id, suppress)
      await insertTestCommunityVacation({
        communityId: community.id,
        userId: owner.id,
        startsAt: expired
          ? new Date(now.getTime() - 7_200_000).toISOString()
          : new Date(now.getTime() - 1_000).toISOString(),
        endsAt: expired ? new Date(now.getTime() - 3_600_000).toISOString() : null,
      })

      const result = await runDigestBatchForUser(owner.id, { windowStart: start, windowEnd: end })
      expect(result.created.some(item => item.userId === owner.id)).toBe(delivered)
    },
  )

  it('excludes archived, removed, deleted, and site-suspended recipients', async () => {
    const now = new Date()
    const input = {
      windowStart: new Date(now.getTime() - 3_600_000),
      windowEnd: new Date(now.getTime() + 3_600_000),
    }
    const users = await Promise.all(Array.from({ length: 4 }, () => createTestUserDirect()))
    const communities = await Promise.all(
      users.map(user => insertTestCommunity({ createdById: user!.id })),
    )
    await Promise.all(
      users.map((user, index) =>
        insertTestCommunityMember({
          communityId: communities[index]!.id,
          userId: user!.id,
          role: 'owner',
          createdAt: now,
        }),
      ),
    )
    await archiveTestCommunity({ communityId: communities[0]!.id, archivedById: users[0]!.id })
    await removeTestCommunityMember(communities[1]!.id, users[1]!.id)
    await softDeleteUser(users[2]!.id)
    await suspendTestUser(users[3]!.id)

    for (const user of users) {
      const result = await runDigestBatchForUser(user!.id, input)
      expect(result.created).not.toContainEqual(expect.objectContaining({ userId: user!.id }))
    }
  })

  it('includes pending moderation workload without using it as the activity gate', async () => {
    const owner = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: owner.id })
    const now = new Date()
    const start = new Date(now.getTime() - 3_600_000)
    const end = new Date(now.getTime() + 3_600_000)
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
      createdAt: new Date(start.getTime() - 86_400_000),
    })
    const postId = await insertTestPost({
      title: 'Pending digest workload',
      slug: `pending-digest-${owner.id}`,
      markdown: 'Pending',
      createdById: owner.id,
      communityId: community.id,
      createdAt: now,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: owner.id,
    })

    const result = await runDigestBatchForUser(owner.id, { windowStart: start, windowEnd: end })
    const row = result.created.find(item => item.userId === owner.id)!
    expect((await listNotifications(owner.id)).notifications[row.notificationId]?.body).toContain(
      '1 items awaiting moderation',
    )
  })
})
