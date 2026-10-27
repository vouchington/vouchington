import { randomUUID } from 'node:crypto'
import { v7 } from 'uuid'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestExpiryWindow,
  createTestHistoricalRetentionWindow,
  createTestOrphanRssFeedItemNotification,
  createTestPost,
  createTestSubscriptionPostNotification,
  createTestUserDirect,
  deleteTestRetentionNotificationPushIntents,
  getTestRejectedSesRetentionDelete,
  getTestNotificationEmailRetentionCursor,
  insertTestModerationSend,
  insertTestRetentionNotificationPushIntent,
  insertTestSesRetentionEvent,
  markTestRetentionNotificationDeleted,
  resetTestNotificationEmailRetentionCursor,
  insertTestCommunity,
  testNotificationEmailRetentionRowExists,
  testSesRetentionSuppressionExists,
} from '@voucha/test-helpers'
import { createCommunityLifecycleNotifications } from '@services/notifications/create-community-lifecycle-notification'
import { isEmailSuppressed } from '@services/ses-bounce-events'
import {
  cleanupModerationEmailSends,
  cleanupSystemPrunedNotifications,
  cleanupSesBounceEvents,
  cleanupUserDeletedNotifications,
} from '../cleanup-notification-email.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('notification and email retention', () => {
  it('resumes raw SES pages and keeps suppression after permanent and complaint events are deleted', async () => {
    const window = createTestHistoricalRetentionWindow()
    const now = new Date(window.upperBoundDate.getTime() + 90 * DAY_MS)
    await using query = await beginTransaction()
    const first = await insertTestSesRetentionEvent(query, 'transient', window.firstEligibleDate)
    const second = await insertTestSesRetentionEvent(query, 'transient', window.secondEligibleDate)
    const permanentAt = new Date(window.firstEligibleDate.getTime() + 1)
    const complaintAt = new Date(window.firstEligibleDate.getTime() + 2)
    const permanent = await insertTestSesRetentionEvent(query, 'permanent', permanentAt)
    const complaint = await insertTestSesRetentionEvent(query, 'complaint', complaintAt)
    const recent = await insertTestSesRetentionEvent(query, 'transient', window.afterUpperBoundDate)
    expect(await getTestRejectedSesRetentionDelete(query, first)).toMatchObject({
      message: expect.stringMatching(/append-only/),
    })
    expect(await getTestRejectedSesRetentionDelete(query, permanent)).toMatchObject({
      message: expect.stringMatching(/append-only/),
    })
    const options = {
      batchSize: 2,
      maxBatches: 1,
      lowerBoundDate: window.lowerBoundDate,
      now,
      borrowedQuery: query,
    }
    expect(await cleanupSesBounceEvents(options)).toMatchObject({
      deleted: 2,
      hasMore: true,
      continuation: { id: permanent },
    })
    expect(await cleanupSesBounceEvents(options)).toEqual({
      deleted: 2,
      hasMore: false,
      continuation: null,
    })
    expect(await getTestNotificationEmailRetentionCursor(query, 'ses_bounce_events')).toBeNull()
    expect(
      await testNotificationEmailRetentionRowExists(query, 'amazon_ses_bounce_events', second),
    ).toBe(false)
    expect(
      await testNotificationEmailRetentionRowExists(query, 'amazon_ses_bounce_events', permanent),
    ).toBe(false)
    expect(
      await testNotificationEmailRetentionRowExists(query, 'amazon_ses_bounce_events', complaint),
    ).toBe(false)
    expect(await testSesRetentionSuppressionExists(query, permanent)).toBe(true)
    expect(await testSesRetentionSuppressionExists(query, complaint)).toBe(true)
    expect(
      await testNotificationEmailRetentionRowExists(query, 'amazon_ses_bounce_events', recent),
    ).toBe(true)
    await query.commit()
    expect(await isEmailSuppressed(`tests+${permanent}@voucha.ai`)).toBe(true)
    expect(await isEmailSuppressed(`tests+${complaint}@voucha.ai`)).toBe(true)
  })

  it('removes old moderator send keys from a persisted UUIDv7 position', async () => {
    const window = createTestHistoricalRetentionWindow()
    const now = new Date(window.upperBoundDate.getTime() + 30 * DAY_MS)
    const user = await createTestUserDirect()
    if (!user) throw new Error('Expected test user')
    await using query = await beginTransaction()
    const first = await insertTestModerationSend(query, user.id, window.firstEligibleDate)
    const second = await insertTestModerationSend(query, user.id, window.secondEligibleDate)
    const recent = await insertTestModerationSend(query, user.id, window.afterUpperBoundDate)
    const options = {
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: window.lowerBoundDate,
      now,
      borrowedQuery: query,
    }
    expect(await cleanupModerationEmailSends(options)).toMatchObject({
      deleted: 1,
      hasMore: true,
      continuation: { id: first },
    })
    expect(await cleanupModerationEmailSends(options)).toEqual({
      deleted: 1,
      hasMore: false,
      continuation: null,
    })
    expect(
      await testNotificationEmailRetentionRowExists(query, 'user_moderation_email_sends', second),
    ).toBe(false)
    expect(
      await testNotificationEmailRetentionRowExists(query, 'user_moderation_email_sends', recent),
    ).toBe(true)
  })

  it('advances past a live post and prunes an old notification whose source is absent', async () => {
    const window = createTestExpiryWindow()
    const now = new Date(window.upperBoundDate.getTime() + 90 * DAY_MS)
    const user = await createTestUserDirect()
    if (!user) throw new Error('Expected test user')
    const post = await createTestPost({ user })
    const protectedId = await createTestSubscriptionPostNotification({
      userId: user.id,
      postId: post.id,
    })
    const orphanId = await createTestOrphanRssFeedItemNotification({
      userId: user.id,
      sentByUserId: user.id,
      publicationRssFeedItemId: v7(),
    })
    await using query = await beginTransaction()
    await resetTestNotificationEmailRetentionCursor(query, 'system_pruned_notifications')
    const preciseDeletedAt = window.firstEligibleDate
      .toISOString()
      .replace(/\.\d{3}Z$/, '.123456+00')
    await markTestRetentionNotificationDeleted(
      query,
      user.id,
      protectedId,
      preciseDeletedAt,
      'system_pruned',
    )
    await markTestRetentionNotificationDeleted(
      query,
      user.id,
      orphanId,
      window.secondEligibleDate,
      'system_pruned',
    )
    await deleteTestRetentionNotificationPushIntents(query, user.id, [protectedId, orphanId])
    const options = {
      batchSize: 1,
      maxBatches: 1,
      lowerBoundDate: window.lowerBoundDate,
      now,
      borrowedQuery: query,
    }
    const protectedPage = await cleanupSystemPrunedNotifications(options)
    expect(protectedPage).toMatchObject({
      deleted: 0,
      hasMore: true,
      continuation: { id: protectedId, userId: user.id },
    })
    expect(protectedPage.continuation?.at).toContain('.123456')
    expect(await cleanupSystemPrunedNotifications(options)).toEqual({
      deleted: 1,
      hasMore: false,
      continuation: null,
    })
    expect(await testNotificationEmailRetentionRowExists(query, 'notifications', protectedId)).toBe(
      true,
    )
    expect(await testNotificationEmailRetentionRowExists(query, 'notifications', orphanId)).toBe(
      false,
    )
  })

  it('retains surviving push intents during user-deleted tombstone cleanup', async () => {
    const window = createTestExpiryWindow()
    const now = new Date(window.upperBoundDate.getTime() + 180 * DAY_MS)
    const user = await createTestUserDirect()
    if (!user) throw new Error('Expected test user')
    const createOrphan = () =>
      createTestOrphanRssFeedItemNotification({
        userId: user.id,
        sentByUserId: user.id,
        publicationRssFeedItemId: v7(),
      })
    const removableId = await createOrphan()
    const protectedId = await createOrphan()
    const recentId = await createOrphan()
    await using query = await beginTransaction()
    await resetTestNotificationEmailRetentionCursor(query, 'user_deleted_notifications')
    await markTestRetentionNotificationDeleted(
      query,
      user.id,
      removableId,
      window.firstEligibleDate,
      'user_deleted',
    )
    await markTestRetentionNotificationDeleted(
      query,
      user.id,
      protectedId,
      window.firstEligibleDate,
      'user_deleted',
    )
    await markTestRetentionNotificationDeleted(
      query,
      user.id,
      recentId,
      window.afterUpperBoundDate,
      'user_deleted',
    )
    await deleteTestRetentionNotificationPushIntents(query, user.id, [
      removableId,
      protectedId,
      recentId,
    ])
    await insertTestRetentionNotificationPushIntent(query, user.id, protectedId)
    expect(
      await cleanupUserDeletedNotifications({
        batchSize: 2,
        maxBatches: 1,
        lowerBoundDate: window.lowerBoundDate,
        now,
        borrowedQuery: query,
      }),
    ).toMatchObject({
      deleted: 1,
      hasMore: false,
    })
    expect(await testNotificationEmailRetentionRowExists(query, 'notifications', removableId)).toBe(
      false,
    )
    expect(await testNotificationEmailRetentionRowExists(query, 'notifications', protectedId)).toBe(
      true,
    )
    expect(await testNotificationEmailRetentionRowExists(query, 'notifications', recentId)).toBe(
      true,
    )
  })

  it('preserves a dismissed source-backed event and suppresses its replay', async () => {
    const window = createTestExpiryWindow()
    const now = new Date(window.upperBoundDate.getTime() + 180 * DAY_MS)
    const user = await createTestUserDirect()
    if (!user) throw new Error('Expected test user')
    const community = await insertTestCommunity({ createdById: user.id })
    const eventKey = `community-role-change:${community.id}:${user.id}:${randomUUID()}`
    const input = {
      userId: user.id,
      communityId: community.id,
      entityType: 'community_role_change' as const,
      eventKey,
      title: 'Your role changed',
      body: 'Your community role changed.',
    }
    await using query = await beginTransaction()
    await resetTestNotificationEmailRetentionCursor(query, 'user_deleted_notifications')
    const [created] = await createCommunityLifecycleNotifications([input], { query })
    if (!created) throw new Error('Expected source-backed notification')
    const id = created.notificationId
    await markTestRetentionNotificationDeleted(
      query,
      user.id,
      id,
      window.firstEligibleDate,
      'user_deleted',
    )
    await deleteTestRetentionNotificationPushIntents(query, user.id, [id])
    expect(
      await cleanupUserDeletedNotifications({
        batchSize: 1,
        maxBatches: 1,
        lowerBoundDate: window.lowerBoundDate,
        now,
        borrowedQuery: query,
      }),
    ).toMatchObject({ deleted: 0, hasMore: false })
    expect(await testNotificationEmailRetentionRowExists(query, 'notifications', id)).toBe(true)
    expect(await createCommunityLifecycleNotifications([input], { query })).toEqual([])
  })
})
