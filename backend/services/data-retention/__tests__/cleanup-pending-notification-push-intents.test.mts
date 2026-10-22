import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import sql from 'sql-template-strings'
import {
  createTestManualPostNotification,
  createTestPost,
  createTestUser,
  notificationPushIntentExists,
  setTestPendingPushIntentRetentionState,
  withTestScopedPendingPushRetention,
} from '@voucha/test-helpers'
import { cleanupOldPendingNotificationPushIntents } from '../cleanup.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('old pending notification push intent cleanup', () => {
  it('ages intents, protects active leases, and resumes after a protected row', async () => {
    const now = new Date()
    const user = await createTestUser()
    if (!user) throw new Error('Expected notification recipient')
    const post = await createTestPost({ user })
    const makeNotification = (id?: string) =>
      createTestManualPostNotification({
        id,
        userId: user.id,
        sentByUserId: user.id,
        postId: post.id,
      })
    const oldNotificationNewIntent = await makeNotification(
      v7({ msecs: now.getTime() - 40 * DAY_MS }),
    )
    const agedIdle = await makeNotification()
    const agedActiveLease = await makeNotification()
    const agedExpiredLease = await makeNotification()
    const recent = await makeNotification()
    const allIds = [oldNotificationNewIntent, agedIdle, agedActiveLease, agedExpiredLease, recent]

    const { result, remainingIds } = await withTestScopedPendingPushRetention(
      { userId: user.id, notificationIds: allIds },
      async borrowedQuery => {
        const { rows: initialCursor } = await borrowedQuery<{
          cursor_created_at: string | null
        }>(sql`
          /* readTestResetPendingPushRetentionCursor */
          SELECT cursor_created_at::text FROM notification_push_intent_retention_cursors
          WHERE is_singleton`)
        expect(initialCursor[0]?.cursor_created_at).toBeNull()
        await setTestPendingPushIntentRetentionState(borrowedQuery, {
          userId: user.id,
          notificationId: agedIdle,
          createdAt: new Date(now.getTime() - 33 * DAY_MS),
        })
        await setTestPendingPushIntentRetentionState(borrowedQuery, {
          userId: user.id,
          notificationId: agedActiveLease,
          createdAt: new Date(now.getTime() - 32 * DAY_MS),
          leaseExpiresAt: new Date(now.getTime() + DAY_MS),
        })
        await setTestPendingPushIntentRetentionState(borrowedQuery, {
          userId: user.id,
          notificationId: agedExpiredLease,
          createdAt: new Date(now.getTime() - 31 * DAY_MS),
          leaseExpiresAt: new Date(now.getTime() - DAY_MS),
        })
        const options = {
          batchSize: 1,
          maxBatches: 1,
          now,
          borrowedQuery,
          scopeUserId: user.id,
        }
        const first = await cleanupOldPendingNotificationPushIntents(options)
        expect(first).toMatchObject({
          deleted: 1,
          hasMore: true,
          continuation: {
            notificationId: agedIdle,
            userId: user.id,
            createdAt: expect.any(String),
          },
        })
        const second = await cleanupOldPendingNotificationPushIntents(options)
        expect(second).toMatchObject({
          deleted: 0,
          hasMore: true,
          continuation: {
            notificationId: agedActiveLease,
            userId: user.id,
            createdAt: expect.any(String),
          },
        })
        return cleanupOldPendingNotificationPushIntents(options)
      },
    )
    expect(result).toEqual({ deleted: 1, hasMore: false, continuation: null })
    expect(remainingIds).toHaveLength(3)
    expect(remainingIds).toEqual(
      expect.arrayContaining([oldNotificationNewIntent, agedActiveLease, recent]),
    )
    for (const id of allIds) {
      await expect(notificationPushIntentExists(user.id, id)).resolves.toBe(true)
    }
  })
})
