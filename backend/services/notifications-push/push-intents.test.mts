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

  it('continues only owned pending intents past eligible earlier and later peers', async () => {
    const follower = await createTestUserDirect()
    const fixtures: Array<{ userId: string; notificationId: string }> = []
    for (let index = 0; index < 6; index += 1) {
      const recipient = await createTestUserDirect()
      const [notification] = await createFollowNotification(
        recipient.id,
        follower.id,
        follower.username,
      )
      fixtures.push({ userId: recipient.id, notificationId: notification!.id })
    }
    const all = await listAvailableNotificationPushIntents(6, {
      notificationIds: fixtures.map(fixture => fixture.notificationId),
    })
    expect(all).toHaveLength(6)
    const [lower, owned, upper] = [all.slice(0, 2), all.slice(2, 4), all.slice(4)]
    const ownedIds = owned.map(intent => intent.notification_id)
    const scanBefore = all[0]!.scan_before
    const beforeFirstPeer = {
      ...toCursor(lower[0]!),
      updatedAt: new Date(Date.parse(lower[0]!.updated_at) - 1).toISOString(),
    }
    const firstPage = await listAvailableNotificationPushIntents(1, {
      notificationIds: ownedIds,
      scanBefore,
      after: beforeFirstPeer,
    })
    expect(firstPage.map(intent => intent.notification_id)).toEqual([ownedIds[0]])
    const secondPage = await listAvailableNotificationPushIntents(1, {
      notificationIds: ownedIds,
      scanBefore,
      after: toCursor(firstPage[0]!),
    })
    expect(secondPage.map(intent => intent.notification_id)).toEqual([ownedIds[1]])
    const finalPage = await listAvailableNotificationPushIntents(1, {
      notificationIds: ownedIds,
      scanBefore,
      after: toCursor(secondPage[0]!),
    })
    expect(finalPage).toEqual([])
    expect([...firstPage, ...secondPage].map(intent => intent.notification_id)).toEqual(ownedIds)
    for (const peer of [...lower, ...upper]) {
      expect(await getTestNotificationPushIntent(peer.user_id, peer.notification_id)).toMatchObject(
        {
          status: 'pending',
        },
      )
    }
  })
})

function toCursor(intent: { updated_at: string; user_id: string; notification_id: string }) {
  return {
    updatedAt: intent.updated_at,
    userId: intent.user_id,
    notificationId: intent.notification_id,
  }
}

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
