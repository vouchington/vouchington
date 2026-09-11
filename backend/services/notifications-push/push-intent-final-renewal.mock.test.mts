import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import webpush, { type SendResult } from 'web-push'
import { createTestUserDirect } from '@voucha/test-helpers'
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
  return { ...mockedModule, default: mockedModule }
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

  it.each([false, new Error('preflight renewal failed')])(
    'does not start delivery when preflight renewal is %s',
    async renewalResult => {
      const intent = await createDelivery()
      const renew = vi.fn<() => Promise<boolean>>(async () => {
        if (renewalResult instanceof Error) throw renewalResult
        return renewalResult
      })
      const release = vi.fn<() => Promise<boolean>>(async () => true)
      const markDelivered = vi.fn<() => Promise<boolean>>(async () => true)
      const persist = vi.fn<() => Promise<'persisted'>>(async () => 'persisted')
      const delivery = deliverClaimedNotificationPushIntent(intent, policy, {
        renew,
        release,
        markDelivered,
        persist,
      })

      const result = await delivery.then(
        value => ({ value, error: undefined }),
        error => ({ value: undefined, error }),
      )
      expect({
        value: result.value,
        errorMessage: result.error instanceof Error ? result.error.message : undefined,
      }).toEqual(
        renewalResult instanceof Error
          ? { value: undefined, errorMessage: 'preflight renewal failed' }
          : { value: { delivered: 0, suppressed: false }, errorMessage: undefined },
      )
      expect(renew).toHaveBeenCalledOnce()
      expect(webpush.sendNotification).not.toHaveBeenCalled()
      expect(persist).not.toHaveBeenCalled()
      expect(release).not.toHaveBeenCalled()
      expect(markDelivered).not.toHaveBeenCalled()
    },
  )

  it.each([false, new Error('final renewal failed')])(
    'does not finalize when final renewal is %s',
    async renewalResult => {
      const intent = await createDelivery()
      let renewals = 0
      const renew = vi.fn<() => Promise<boolean>>(async () => {
        renewals++
        if (renewals === 1) return true
        if (renewalResult instanceof Error) throw renewalResult
        return renewalResult
      })
      const release = vi.fn<() => Promise<boolean>>(async () => true)
      const markDelivered = vi.fn<() => Promise<boolean>>(async () => true)
      const delivery = deliverClaimedNotificationPushIntent(intent, policy, {
        renew,
        release,
        markDelivered,
      })
      const result = await delivery.then(
        value => ({ value, error: undefined }),
        error => ({ value: undefined, error }),
      )
      expect({
        value: result.value,
        errorMessage: result.error instanceof Error ? result.error.message : undefined,
      }).toEqual(
        renewalResult instanceof Error
          ? { value: undefined, errorMessage: 'final renewal failed' }
          : { value: { delivered: 0, suppressed: false }, errorMessage: undefined },
      )
      expect(renew).toHaveBeenCalledTimes(2)
      expect(webpush.sendNotification).toHaveBeenCalledOnce()
      expect(release).not.toHaveBeenCalled()
      expect(markDelivered).not.toHaveBeenCalled()
    },
  )
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
