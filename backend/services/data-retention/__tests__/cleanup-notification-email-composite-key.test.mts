import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  beginTransaction,
  createTestExpiryWindow,
  createTestUserDirect,
  deleteTestRetentionNotificationPushIntents,
  insertTestSameIdNotificationTombstones,
  listTestSameIdNotificationOwners,
  resetTestNotificationEmailRetentionCursor,
} from '@voucha/test-helpers'
import { cleanupUserDeletedNotifications } from '../cleanup-notification-email.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('notification tombstone retention composite key', () => {
  it('resumes between two users with the same notification ID and deletion timestamp', async () => {
    const window = createTestExpiryWindow()
    const now = new Date(window.upperBoundDate.getTime() + 180 * DAY_MS)
    const firstUser = await createTestUserDirect()
    const secondUser = await createTestUserDirect()
    if (!firstUser || !secondUser) throw new Error('Expected test users')
    const users = [firstUser.id, secondUser.id].toSorted()
    const sharedId = v7()
    await using query = await beginTransaction()
    await resetTestNotificationEmailRetentionCursor(query, 'user_deleted_notifications')
    await insertTestSameIdNotificationTombstones(query, users, sharedId, window.firstEligibleDate)
    for (const userId of users) {
      await deleteTestRetentionNotificationPushIntents(query, userId, [sharedId])
    }
    const options = {
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: window.lowerBoundDate,
      now,
      borrowedQuery: query,
    }

    expect(await cleanupUserDeletedNotifications(options)).toMatchObject({
      deleted: 1,
      hasMore: true,
      continuation: { id: sharedId, userId: users[0] },
    })
    expect(await listTestSameIdNotificationOwners(query, sharedId, users)).toEqual([users[1]])
    expect(await cleanupUserDeletedNotifications(options)).toEqual({
      deleted: 1,
      hasMore: false,
      continuation: null,
    })
    expect(await listTestSameIdNotificationOwners(query, sharedId, users)).toEqual([])
  })
})
