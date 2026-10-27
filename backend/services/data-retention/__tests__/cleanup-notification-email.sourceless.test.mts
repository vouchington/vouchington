import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestExpiryWindow,
  createTestUserDirect,
  deleteTestRetentionNotificationPushIntents,
  insertTestRetentionNotificationPushIntent,
  resetTestNotificationEmailRetentionCursor,
  testNotificationEmailRetentionRowExists,
} from '@voucha/test-helpers'
import {
  insertTestMinimalCopyrightNotice,
  insertTestNoContentSourceNotificationTombstone,
} from '@voucha/test-helpers/notification-email-tombstone-fixtures'
import { cleanupUserDeletedNotifications } from '../cleanup-notification-email.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('notification tombstones with no post or RSS source', () => {
  it('deletes an eligible all-null source row while preserving push, replay, and copyright guards', async () => {
    const window = createTestExpiryWindow()
    const now = new Date(window.upperBoundDate.getTime() + 180 * DAY_MS)
    const user = await createTestUserDirect()
    if (!user) throw new Error('Expected test user')
    await using query = await beginTransaction()
    await resetTestNotificationEmailRetentionCursor(query, 'user_deleted_notifications')
    const insert = (options: {
      entityType: 'review_dispute' | 'copyright_notice'
      copyrightNoticeId?: string
      eventKey?: string
    }) =>
      insertTestNoContentSourceNotificationTombstone(query, {
        ...options,
        userId: user.id,
        deletedAt: window.firstEligibleDate,
      })
    const removable = await insert({ entityType: 'review_dispute' })
    const pending = await insert({ entityType: 'review_dispute' })
    const replay = await insert({ entityType: 'review_dispute', eventKey: randomUUID() })
    const copyrightNoticeId = await insertTestMinimalCopyrightNotice(query)
    const copyright = await insert({ entityType: 'copyright_notice', copyrightNoticeId })
    await deleteTestRetentionNotificationPushIntents(query, user.id, [
      removable,
      pending,
      replay,
      copyright,
    ])
    await insertTestRetentionNotificationPushIntent(query, user.id, pending)

    expect(
      await cleanupUserDeletedNotifications({
        batchSize: 4,
        maxBatches: 1,
        lowerBoundDate: window.lowerBoundDate,
        now,
        borrowedQuery: query,
      }),
    ).toMatchObject({ deleted: 1 })
    expect(await testNotificationEmailRetentionRowExists(query, 'notifications', removable)).toBe(
      false,
    )
    for (const id of [pending, replay, copyright]) {
      expect(await testNotificationEmailRetentionRowExists(query, 'notifications', id)).toBe(true)
    }
  })

  it('skips permanently retained tombstones before filling a one-row deletion page', async () => {
    const window = createTestExpiryWindow()
    const now = new Date(window.upperBoundDate.getTime() + 180 * DAY_MS)
    const user = await createTestUserDirect()
    if (!user) throw new Error('Expected test user')
    await using query = await beginTransaction()
    const insert = (options: {
      entityType: 'review_dispute' | 'copyright_notice'
      copyrightNoticeId?: string
      eventKey?: string
    }) =>
      insertTestNoContentSourceNotificationTombstone(query, {
        ...options,
        userId: user.id,
        deletedAt: window.firstEligibleDate,
      })
    const replay = await insert({ entityType: 'review_dispute', eventKey: randomUUID() })
    const copyrightNoticeId = await insertTestMinimalCopyrightNotice(query)
    const copyright = await insert({ entityType: 'copyright_notice', copyrightNoticeId })
    const removable = await insert({ entityType: 'review_dispute' })
    await deleteTestRetentionNotificationPushIntents(query, user.id, [replay, copyright, removable])

    expect(
      await cleanupUserDeletedNotifications({
        batchSize: 1,
        maxBatches: 1,
        lowerBoundDate: window.lowerBoundDate,
        now,
        borrowedQuery: query,
      }),
    ).toEqual({ deleted: 1, hasMore: false, continuation: null })
    expect(await testNotificationEmailRetentionRowExists(query, 'notifications', replay)).toBe(true)
    expect(await testNotificationEmailRetentionRowExists(query, 'notifications', copyright)).toBe(
      true,
    )
    expect(await testNotificationEmailRetentionRowExists(query, 'notifications', removable)).toBe(
      false,
    )
  })
})
