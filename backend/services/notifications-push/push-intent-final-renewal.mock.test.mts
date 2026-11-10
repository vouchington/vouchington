import { beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import * as webpush from 'web-push'
import type { SendResult } from 'web-push'
import { createTestUserDirect } from '@voucha/test-helpers'
import {
  answerPostgresWritesForTest,
  rejectPostgresWriteForTest,
} from '@voucha/test-helpers/injected-failures'
import { getIntentState } from '@voucha/test-helpers/notification-push-fixtures'
import { createFollowNotification } from '@services/notifications/create-follow-notification'
import { upsertWebPushSubscription } from '@services/notifications/push-subscriptions'
import { deliverClaimedNotificationPushIntent, claimNotificationPushIntent } from './index.mts'
import type { NotificationPushDeliveryPolicy } from './push-intent-delivery-policy.mts'

const policy: NotificationPushDeliveryPolicy = {
  leaseSeconds: 120,
  renewalMs: 30_000,
  endpointConcurrency: 1,
  socketTimeoutMs: 30_000,
}

vi.mock<typeof import('web-push')>(import('web-push'), async importActual => {
  const actual = await importActual()
  const mockedModule = {
    ...actual,
    sendNotification: vi.fn<typeof actual.sendNotification>(),
    setVapidDetails: vi.fn<typeof actual.setVapidDetails>(),
  }
  return mockedModule
})

describe('notification push final lease renewal', () => {
  beforeAll(() => {
    process.env.WEB_PUSH_PUBLIC_KEY = 'test-public-key'
    process.env.WEB_PUSH_PRIVATE_KEY = 'test-private-key'
    process.env.WEB_PUSH_SUBJECT = 'mailto:tests+push-final-renewal@voucha.ai'
  })

  beforeEach(() => {
    vi.mocked(webpush.sendNotification).mockReset()
    vi.mocked(webpush.sendNotification).mockResolvedValue(successfulSendResult())
  })

  it('does not start delivery when preflight renewal matches no lease', async () => {
    const intent = await createDelivery()
    const before = await getIntentState(intent)
    onTestFinished(answerPostgresWritesForTest('renewNotificationPushIntentLease', [[]]))

    await expect(deliverClaimedNotificationPushIntent(intent, policy)).resolves.toEqual({
      delivered: 0,
      suppressed: false,
    })

    expect(webpush.sendNotification).not.toHaveBeenCalled()
    await expect(getIntentState(intent)).resolves.toEqual(before)
  })

  it('does not start delivery when preflight renewal fails', async () => {
    const intent = await createDelivery()
    const before = await getIntentState(intent)
    onTestFinished(
      rejectPostgresWriteForTest(
        'renewNotificationPushIntentLease',
        new Error('preflight renewal failed'),
      ),
    )

    await expect(deliverClaimedNotificationPushIntent(intent, policy)).rejects.toThrow(
      'preflight renewal failed',
    )

    expect(webpush.sendNotification).not.toHaveBeenCalled()
    await expect(getIntentState(intent)).resolves.toEqual(before)
  })

  it('does not finalize when final renewal matches no lease', async () => {
    const intent = await createDelivery()
    const before = await getIntentState(intent)
    onTestFinished(answerPostgresWritesForTest('renewNotificationPushIntentLease', [undefined, []]))

    await expect(deliverClaimedNotificationPushIntent(intent, policy)).resolves.toEqual({
      delivered: 0,
      suppressed: false,
    })

    expect(webpush.sendNotification).toHaveBeenCalledOnce()
    await expect(getIntentState(intent)).resolves.toEqual(before)
  })

  it('does not finalize when final renewal fails', async () => {
    const intent = await createDelivery()
    const before = await getIntentState(intent)
    let renewals = 0
    onTestFinished(
      rejectPostgresWriteForTest(
        'renewNotificationPushIntentLease',
        new Error('final renewal failed'),
        () => ++renewals === 2,
      ),
    )

    await expect(deliverClaimedNotificationPushIntent(intent, policy)).rejects.toThrow(
      'final renewal failed',
    )

    expect(webpush.sendNotification).toHaveBeenCalledOnce()
    await expect(getIntentState(intent)).resolves.toEqual(before)
  })
})

async function createDelivery() {
  const recipient = await createTestUserDirect()
  const follower = await createTestUserDirect()
  const [notification] = await createFollowNotification(
    recipient.id,
    follower.id,
    follower.username,
  )
  const endpoint = `https://push.example.com/${crypto.randomUUID()}`
  await upsertWebPushSubscription({
    userId: recipient.id,
    endpoint,
    p256dh: `${endpoint}-p256dh`,
    auth: `${endpoint}-auth`,
    expirationTimeMs: null,
    userAgent: 'vitest',
  })
  const intent = await claimNotificationPushIntent(
    { user_id: recipient.id, notification_id: notification!.id },
    policy.leaseSeconds,
  )
  if (!intent) throw new Error('Expected notification push intent claim')
  return intent
}

function successfulSendResult(): SendResult {
  return { statusCode: 201, body: '', headers: {} }
}
