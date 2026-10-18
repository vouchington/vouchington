import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
  insertTestCommunityVacation,
  setTestCommunityDigestVacationSuppression,
} from '@voucha/test-helpers'
import {
  runDigestBatchForUser,
  createDigestRecipientRangeFixtures,
  runGlobalDigestBatchForTest,
} from '@voucha/test-helpers/community-activity-digest-fixtures'
import { withTestDigestClock } from '@voucha/test-helpers/community-activity-digest-clock'
import { listNotifications } from './list.mts'

describe('community activity digest top discussion', () => {
  it(
    'omits top discussion when every discussion has zero in-window replies',
    withTestDigestClock(async now => {
      const owner = await createTestUserDirect()
      const community = await insertTestCommunity({ createdById: owner.id })
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
      const result = await runDigestBatchForUser(
        owner.id,
        {
          windowStart: start,
          windowEnd: end,
        },
        now,
      )
      const row = result.created.find(item => item.userId === owner.id)!
      const notification = (await listNotifications(owner.id)).notifications[row.notificationId]
      expect(notification?.body).toContain('1 reviews')
      expect(notification?.body).not.toContain('top discussion')
      expect(notification?.body).not.toContain('Zero reply candidate')
    }),
  )

  it.each([
    { boundary: 'before start', startsOffset: 1, endsOffset: null, delivered: true },
    { boundary: 'at start', startsOffset: 0, endsOffset: null, delivered: false },
    { boundary: 'after start', startsOffset: -1, endsOffset: null, delivered: false },
    { boundary: 'before end', startsOffset: -3_600_000, endsOffset: 1, delivered: false },
    { boundary: 'at end', startsOffset: -3_600_000, endsOffset: 0, delivered: true },
    { boundary: 'after end', startsOffset: -3_600_000, endsOffset: -1, delivered: true },
  ])(
    'vacation $boundary delivers=$delivered',
    withTestDigestClock(
      async (
        now,
        options: {
          boundary: string
          startsOffset: number
          endsOffset: number | null
          delivered: boolean
        },
      ) => {
        const owner = await createTestUserDirect()
        const community = await insertTestCommunity({ createdById: owner.id })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: owner.id,
          role: 'owner',
          createdAt: now,
        })
        await setTestCommunityDigestVacationSuppression(community.id, owner.id, true)
        await insertTestCommunityVacation({
          communityId: community.id,
          userId: owner.id,
          startsAt: new Date(now.getTime() + options.startsOffset).toISOString(),
          endsAt:
            options.endsOffset === null
              ? null
              : new Date(now.getTime() + options.endsOffset).toISOString(),
        })
        const result = await runDigestBatchForUser(
          owner.id,
          {
            windowStart: new Date(now.getTime() - 3_600_000),
            windowEnd: new Date(now.getTime() + 3_600_000),
          },
          now,
        )
        expect(result.created.some(item => item.userId === owner.id)).toBe(options.delivered)
        expect((await listNotifications(owner.id)).results).toHaveLength(options.delivered ? 1 : 0)
      },
    ),
  )

  it('retains default global recipients while an explicit UUID range fences the retry', async () => {
    const businessNow = new Date('2005-04-12T12:00:00.000Z')
    const { owner, foreign, input } = await createDigestRecipientRangeFixtures(businessNow)
    const global = await runGlobalDigestBatchForTest(owner.id, foreign.id, input, businessNow)
    expect(global.created).toContainEqual(expect.objectContaining({ userId: owner.id }))
    expect(global.created).toContainEqual(expect.objectContaining({ userId: foreign.id }))
    const bounded = await runDigestBatchForUser(owner.id, input, businessNow)
    expect(bounded.created).toHaveLength(1)
    expect(bounded.created).toContainEqual(expect.objectContaining({ userId: owner.id }))
    expect(bounded.created).not.toContainEqual(expect.objectContaining({ userId: foreign.id }))
    expect((await listNotifications(owner.id)).results).toHaveLength(1)
    expect((await listNotifications(foreign.id)).results).toHaveLength(1)
  })
})
