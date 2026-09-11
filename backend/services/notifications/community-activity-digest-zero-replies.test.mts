import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
} from '@voucha/test-helpers'
import { createCommunityActivityDigestBatch } from './community-activity-digest.mts'
import { listNotifications } from './list.mts'

describe('community activity digest top discussion', () => {
  it('omits top discussion when every discussion has zero in-window replies', async () => {
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
    await Promise.all([
      insertTestPost({
        title: 'Zero reply candidate',
        slug: `zero-reply-${owner.id}`,
        markdown: 'Discussion',
        createdById: owner.id,
        communityId: community.id,
        createdAt: now,
      }),
      insertTestPost({
        title: 'Qualifying review activity',
        slug: `qualifying-review-${owner.id}`,
        markdown: 'Review',
        postType: 'review',
        createdById: owner.id,
        communityId: community.id,
        createdAt: now,
      }),
    ])
    const compact = owner.id.replaceAll('-', '')
    const previous = (BigInt(`0x${compact}`) - 1n).toString(16).padStart(32, '0')
    const afterUserId = previous.replace(/^(.{8})(.{4})(.{4})(.{4})(.*)$/, '$1-$2-$3-$4-$5')
    const result = await createCommunityActivityDigestBatch({
      windowStart: start,
      windowEnd: end,
      afterUserId,
    })
    const row = result.created.find(item => item.userId === owner.id)!
    const notification = (await listNotifications(owner.id)).notifications[row.notificationId]
    expect(notification?.body).toContain('1 reviews')
    expect(notification?.body).not.toContain('top discussion')
    expect(notification?.body).not.toContain('Zero reply candidate')
  })
})
