import { describe, expect, it } from 'vitest'
import {
  createTestManualPostNotification,
  createTestPost,
  createTestRetentionWindow,
  createTestUser,
  notificationPushIntentExists,
  setTestNotificationPushIntentTerminalState,
} from '@voucha/test-helpers'
import { cleanupTerminalNotificationPushIntents } from '../cleanup.mts'

describe('terminal notification push intent cleanup', () => {
  it('removes old delivered and suppressed intents but preserves pending and recent work', async () => {
    const window = createTestRetentionWindow()
    const user = await createTestUser()
    if (!user) throw new Error('Expected notification recipient')
    const post = await createTestPost({ user })
    const notificationIds = await Promise.all(
      Array.from({ length: 4 }, () =>
        createTestManualPostNotification({
          userId: user.id,
          sentByUserId: user.id,
          postId: post.id,
        }),
      ),
    )
    await Promise.all([
      setTestNotificationPushIntentTerminalState({
        userId: user.id,
        notificationId: notificationIds[0]!,
        status: 'delivered',
        terminalAt: window.firstEligibleDate,
      }),
      setTestNotificationPushIntentTerminalState({
        userId: user.id,
        notificationId: notificationIds[1]!,
        status: 'suppressed',
        terminalAt: window.secondEligibleDate,
      }),
      setTestNotificationPushIntentTerminalState({
        userId: user.id,
        notificationId: notificationIds[3]!,
        status: 'delivered',
        terminalAt: window.afterUpperBoundDate,
      }),
    ])

    await expect(cleanupTerminalNotificationPushIntents(window)).resolves.toEqual({
      deleted: 2,
      hasMore: false,
    })
    await expect(notificationPushIntentExists(user.id, notificationIds[0]!)).resolves.toBe(false)
    await expect(notificationPushIntentExists(user.id, notificationIds[1]!)).resolves.toBe(false)
    await expect(notificationPushIntentExists(user.id, notificationIds[2]!)).resolves.toBe(true)
    await expect(notificationPushIntentExists(user.id, notificationIds[3]!)).resolves.toBe(true)
  })

  it('stops after the configured number of locked deletion batches', async () => {
    const window = createTestRetentionWindow()
    const user = await createTestUser()
    if (!user) throw new Error('Expected notification recipient')
    const post = await createTestPost({ user })
    const notificationIds = await Promise.all(
      Array.from({ length: 2 }, () =>
        createTestManualPostNotification({
          userId: user.id,
          sentByUserId: user.id,
          postId: post.id,
        }),
      ),
    )
    await Promise.all(
      notificationIds.map(notificationId =>
        setTestNotificationPushIntentTerminalState({
          userId: user.id,
          notificationId,
          status: 'delivered',
          terminalAt: window.firstEligibleDate,
        }),
      ),
    )

    await expect(
      cleanupTerminalNotificationPushIntents({ ...window, batchSize: 1, maxBatches: 1 }),
    ).resolves.toEqual({ deleted: 1, hasMore: true })
    const remaining = await Promise.all(
      notificationIds.map(notificationId => notificationPushIntentExists(user.id, notificationId)),
    )
    expect(remaining.filter(Boolean)).toHaveLength(1)
  })
})
