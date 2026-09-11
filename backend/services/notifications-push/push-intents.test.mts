import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestPreCaptureNotification,
  createTestUserDirect,
  getTestNotificationPushIntent,
} from '@voucha/test-helpers'
import { createFollowNotification } from '@services/notifications/create-follow-notification'
import { listAvailableNotificationPushIntents } from './push-intent-recovery.mts'
import { createNotificationPushIntents } from './push-intents.mts'

describe('listAvailableNotificationPushIntents', () => {
  it('rejects a non-positive or non-integer page size', async () => {
    await expect(listAvailableNotificationPushIntents(0)).rejects.toThrow(
      'Push intent limit must be positive',
    )
    await expect(listAvailableNotificationPushIntents(1.5)).rejects.toThrow(
      'Push intent limit must be positive',
    )
  })

  it('returns a pending unleased durable intent', async () => {
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    const firstPage = await listAvailableNotificationPushIntents(100_000)
    const ownIntent = firstPage.find(intent => intent.notification_id === notification!.id)
    expect(ownIntent).toMatchObject({ user_id: recipient.id, notification_id: notification!.id })
    const nextPage = await listAvailableNotificationPushIntents(100_000, {
      scanBefore: ownIntent!.scan_before,
      after: {
        updatedAt: ownIntent!.updated_at,
        userId: ownIntent!.user_id,
        notificationId: ownIntent!.notification_id,
      },
    })
    expect(nextPage.map(intent => intent.notification_id)).not.toContain(notification!.id)
  })
})

describe('createNotificationPushIntents', () => {
  it('creates the missing durable intent for a pre-capture notification', async () => {
    const recipient = await createTestUserDirect()
    const notificationId = await createTestPreCaptureNotification(recipient.id)
    await expect(
      getTestNotificationPushIntent(recipient.id, notificationId),
    ).resolves.toBeUndefined()

    await expect(createPreCaptureNotificationPushIntent()).resolves.toBe(1)

    await expect(
      getTestNotificationPushIntent(recipient.id, notificationId),
    ).resolves.toMatchObject({
      status: 'pending',
    })

    async function createPreCaptureNotificationPushIntent(): Promise<number> {
      await using query = await beginTransaction()
      const result = await createNotificationPushIntents(
        [{ userId: recipient.id, notificationId }],
        { query },
      )
      await query.commit()
      return result
    }
  })
})
