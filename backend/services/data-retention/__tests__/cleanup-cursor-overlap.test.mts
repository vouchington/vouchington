import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  beginTransaction,
  createTestExpiryWindow,
  createTestManualPostNotification,
  createTestPost,
  createTestUserDirect,
  deleteTestRetentionNotificationPushIntents,
  getTestNotificationEmailRetentionCursor,
  getTestRetentionCursor,
  insertTestRetentionToken,
  insertTestSameIdNotificationTombstones,
  listTestSameIdNotificationOwners,
  resetTestNotificationEmailRetentionCursor,
  resetTestRetentionCursor,
  readTestPendingPushRetentionPosition,
  setTestPendingPushIntentRetentionState,
  testRetentionRowExists,
  withTestScopedPendingPushRetention,
} from '@voucha/test-helpers'
import { beforeBorrowedPostgresQueryForTest } from '@voucha/test-helpers/postgres-transaction'
import { cleanupEmailAddressLoginTokens } from '../cleanup-auth-sessions.mts'
import { cleanupUserDeletedNotifications } from '../cleanup-notification-email.mts'
import { cleanupOldPendingNotificationPushIntents } from '../cleanup-notification-push-intents.mts'

const DAY_MS = 86_400_000

describe('overlapping retention cursor checkpoints', () => {
  it('keeps the newer auth cursor and deletes the older page', async () => {
    const window = createTestExpiryWindow()
    const family = 'email_address_login_tokens'
    const middleDate = new Date(window.firstEligibleDate.getTime() + 1)
    await using borrowedQuery = await beginTransaction()
    await resetTestRetentionCursor(borrowedQuery, family)
    const first = await insertTestRetentionToken(borrowedQuery, family, window.firstEligibleDate)
    const second = await insertTestRetentionToken(borrowedQuery, family, middleDate)
    const third = await insertTestRetentionToken(borrowedQuery, family, window.secondEligibleDate)
    const options = {
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: window.lowerBoundDate,
      now: new Date(window.upperBoundDate.getTime() + DAY_MS),
      borrowedQuery,
    }
    const olderQuery = beforeBorrowedPostgresQueryForTest(
      borrowedQuery,
      'deleteAuthSessionRetentionPage',
      async () => {
        expect(
          await cleanupEmailAddressLoginTokens({ ...options, lowerBoundDate: middleDate }),
        ).toEqual({ deleted: 1, hasMore: true, continuation: { at: null, id: second } })
      },
    )
    const stale = await cleanupEmailAddressLoginTokens({
      ...options,
      maxBatches: 2,
      borrowedQuery: olderQuery,
    })

    expect(await getTestRetentionCursor(borrowedQuery, family)).toMatchObject({ cursor_id: second })
    expect(stale).toEqual({ deleted: 1, hasMore: false, continuation: null })
    expect(await testRetentionRowExists(borrowedQuery, family, first)).toBe(false)
    expect(await testRetentionRowExists(borrowedQuery, family, third)).toBe(true)
  })

  it('keeps the newer notification partition position when time and ID tie', async () => {
    const window = createTestExpiryWindow()
    const users = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const userIds = users.map(user => user.id).toSorted()
    const sharedId = v7()
    await using borrowedQuery = await beginTransaction()
    await resetTestNotificationEmailRetentionCursor(borrowedQuery, 'user_deleted_notifications')
    await insertTestSameIdNotificationTombstones(
      borrowedQuery,
      userIds,
      sharedId,
      window.firstEligibleDate,
    )
    for (const userId of userIds) {
      await deleteTestRetentionNotificationPushIntents(borrowedQuery, userId, [sharedId])
    }
    const options = {
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: window.lowerBoundDate,
      now: new Date(window.upperBoundDate.getTime() + 180 * DAY_MS),
      borrowedQuery,
    }
    expect(await cleanupUserDeletedNotifications(options)).toMatchObject({
      deleted: 1,
      hasMore: true,
      continuation: { id: sharedId, userId: userIds[0] },
    })
    const olderQuery = beforeBorrowedPostgresQueryForTest(
      borrowedQuery,
      'deleteNotificationTombstonePage',
      async () => {
        expect(await cleanupUserDeletedNotifications({ ...options, batchSize: 2 })).toMatchObject({
          deleted: 2,
          hasMore: true,
          continuation: { id: sharedId, userId: userIds[2] },
        })
      },
    )
    const stale = await cleanupUserDeletedNotifications({ ...options, borrowedQuery: olderQuery })
    expect(
      await getTestNotificationEmailRetentionCursor(borrowedQuery, 'user_deleted_notifications'),
    ).toMatchObject({
      cursor_notification_id: sharedId,
      cursor_notification_partition_id: userIds[2],
    })
    expect(stale).toEqual({ deleted: 0, hasMore: false, continuation: null })
    expect(await listTestSameIdNotificationOwners(borrowedQuery, sharedId, userIds)).toEqual([
      userIds[3],
    ])
  })

  it('keeps the newer pending push cursor', async () => {
    const now = new Date()
    const user = await createTestUserDirect()
    const post = await createTestPost({ user })
    const notificationIds = await Promise.all(
      Array.from({ length: 3 }, () =>
        createTestManualPostNotification({
          userId: user.id,
          sentByUserId: user.id,
          postId: post.id,
        }),
      ),
    )
    const { result, remainingIds } = await withTestScopedPendingPushRetention(
      { userId: user.id, notificationIds },
      async borrowedQuery => {
        for (const [index, notificationId] of notificationIds.entries()) {
          await setTestPendingPushIntentRetentionState(borrowedQuery, {
            userId: user.id,
            notificationId,
            createdAt: new Date(now.getTime() - (33 - index) * DAY_MS),
          })
        }
        const options = { batchSize: 1, maxBatches: 1, now, scopeUserId: user.id, borrowedQuery }
        let newerPosition: string | null = null
        const olderQuery = beforeBorrowedPostgresQueryForTest(
          borrowedQuery,
          'deleteOldPendingNotificationPushIntentPage',
          async () => {
            const fast = await cleanupOldPendingNotificationPushIntents({
              ...options,
              batchSize: 2,
            })
            expect(fast).toMatchObject({ deleted: 2, hasMore: true })
            newerPosition = fast.continuation
          },
        )
        const stale = await cleanupOldPendingNotificationPushIntents({
          ...options,
          borrowedQuery: olderQuery,
        })
        expect(await readTestPendingPushRetentionPosition(borrowedQuery)).toBe(newerPosition)
        expect(stale).toEqual({ deleted: 0, hasMore: false, continuation: null })
        return newerPosition
      },
    )
    expect(result).toEqual(expect.any(String))
    expect(remainingIds).toEqual([notificationIds[2]])
  })
})
