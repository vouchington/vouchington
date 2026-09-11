import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Agent } from 'node:https'
import webpush from 'web-push'
import { waitForTestDatabaseTimestamp } from '@voucha/test-helpers'
import { deliverClaimedNotificationPushIntent } from './push-intent-delivery.mts'
import { claimNotificationPushIntent, renewNotificationPushIntentLease } from './push-intents.mts'
import {
  notificationPushDeliveryPolicy,
  type NotificationPushDeliveryPolicy,
} from './push-intent-delivery-policy.mts'
import {
  createDelivery,
  getLeaseExpiry,
  successfulSendResult,
  waitForDeliveredEndpoint,
} from './test-fixtures.mts'

const shortLeasePolicy: NotificationPushDeliveryPolicy = {
  leaseSeconds: 1,
  renewalMs: 50,
  endpointConcurrency: 2,
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
describe('incremental notification push receipts', () => {
  beforeAll(() => {
    process.env.WEB_PUSH_PUBLIC_KEY = 'test-public-key'
    process.env.WEB_PUSH_PRIVATE_KEY = 'test-private-key'
    process.env.WEB_PUSH_SUBJECT = 'mailto:tests+push-incremental@voucha.ai'
  })
  beforeEach(() => {
    vi.mocked(webpush.sendNotification).mockReset()
  })
  it('persists a prompt endpoint before a slow peer settles', async () => {
    const { intent, prompt, promptSubscriptionId, slow } = await createDelivery()
    let resolveSlow!: () => void
    let slowSettled = false
    vi.mocked(webpush.sendNotification).mockImplementation(async subscription => {
      if (subscription.endpoint === prompt) return successfulSendResult()
      await new Promise<void>(resolve => {
        resolveSlow = resolve
      })
      slowSettled = true
      return successfulSendResult()
    })
    const delivery = deliverClaimedNotificationPushIntent(intent)
    await waitForDeliveredEndpoint(intent, promptSubscriptionId)
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
    expect(slowSettled).toBe(false)
    resolveSlow()
    await expect(delivery).resolves.toEqual({ delivered: 2, suppressed: false })
    expect(slow).not.toBe(prompt)
  })
  it('renews a short lease and retries only the unresolved endpoint', async () => {
    const expectedError = 'Transient web push delivery failure'
    const { intent, prompt, promptSubscriptionId, slow } = await createDelivery(1)
    const originalLeaseExpiry = await getLeaseExpiry(intent)
    const slowSend = Promise.withResolvers<void>()
    let renewedAfterOriginalExpiry = false
    let originalExpiryPassed = false
    let renewals = 0
    vi.mocked(webpush.sendNotification).mockImplementation(async subscription => {
      if (subscription.endpoint === prompt) return successfulSendResult()
      await slowSend.promise
      throw Object.assign(new Error('provider unavailable'), { statusCode: 500 })
    })
    const deliveryRejection = deliverClaimedNotificationPushIntent(intent, shortLeasePolicy, {
      renew: async (renewedIntent, leaseSeconds) => {
        renewals++
        const startedAfterOriginalExpiry = originalExpiryPassed
        const accepted = await renewNotificationPushIntentLease(renewedIntent, leaseSeconds)
        if (startedAfterOriginalExpiry) renewedAfterOriginalExpiry = true
        return accepted
      },
    }).catch(error => error)
    try {
      await waitForDeliveredEndpoint(intent, promptSubscriptionId)
      await waitForTestDatabaseTimestamp(originalLeaseExpiry)
      originalExpiryPassed = true
      await vi.waitFor(() => expect(renewedAfterOriginalExpiry).toBe(true), {
        timeout: shortLeasePolicy.leaseSeconds * 2_000,
      })
      expect(renewals).toBeGreaterThan(1)
      await expect(getLeaseExpiry(intent)).resolves.toBeGreaterThan(originalLeaseExpiry)
      await expect(
        claimNotificationPushIntent(
          { user_id: intent.user_id, notification_id: intent.notification_id },
          1,
        ),
      ).resolves.toBeUndefined()
    } finally {
      slowSend.resolve()
      await deliveryRejection
    }
    await expect(Promise.reject(await deliveryRejection)).rejects.toThrow(expectedError)
    vi.mocked(webpush.sendNotification).mockResolvedValue(successfulSendResult())
    const retry = await claimNotificationPushIntent(
      { user_id: intent.user_id, notification_id: intent.notification_id },
      1,
    )
    await expect(deliverClaimedNotificationPushIntent(retry!, shortLeasePolicy)).resolves.toEqual({
      delivered: 1,
      suppressed: false,
    })
    expect(vi.mocked(webpush.sendNotification).mock.calls[2]?.[0].endpoint).toBe(slow)
  })
  it('destroys the agent, settles active work, and suppresses queued sends after persistence loss', async () => {
    const { intent, prompt } = await createDelivery()
    const agent = new Agent()
    const destroy = vi.spyOn(agent, 'destroy')
    let rejectSlow!: (error: Error) => void
    let slowStarted = false
    destroy.mockImplementation(() => {
      rejectSlow?.(new Error('agent destroyed'))
      return agent
    })
    vi.mocked(webpush.sendNotification).mockImplementation(async subscription => {
      if (subscription.endpoint === prompt) return successfulSendResult()
      slowStarted = true
      await new Promise<never>((_resolve, reject) => {
        rejectSlow = reject
      })
      throw new Error('unreachable')
    })

    await expect(
      deliverClaimedNotificationPushIntent(
        intent,
        {
          ...shortLeasePolicy,
          endpointConcurrency: 2,
        },
        {
          createAgent: () => agent,
          persist: async () => 'lease_lost',
        },
      ),
    ).resolves.toEqual({ delivered: 0, suppressed: false })
    expect(slowStarted).toBe(true)
    expect(destroy).toHaveBeenCalled()
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
  })

  it('suppresses queued mappers after a first persistence loss', async () => {
    const { intent } = await createDelivery(120, 3)
    vi.mocked(webpush.sendNotification).mockResolvedValue(successfulSendResult())
    await expect(
      deliverClaimedNotificationPushIntent(
        intent,
        { ...shortLeasePolicy, endpointConcurrency: 1 },
        { persist: async () => 'lease_lost' },
      ),
    ).resolves.toEqual({ delivered: 0, suppressed: false })
    expect(webpush.sendNotification).toHaveBeenCalledOnce()
  })

  it('caps production delivery concurrency at five', async () => {
    const { endpointConcurrency } = notificationPushDeliveryPolicy
    expect(endpointConcurrency).toBe(5)
    const { intent } = await createDelivery(120, endpointConcurrency + 1)
    const schedulingObserved = Promise.withResolvers<void>()
    const releaseSends = Promise.withResolvers<void>()
    let inFlight = 0
    let maxInFlight = 0
    let renewals = 0
    vi.mocked(webpush.sendNotification).mockImplementation(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await releaseSends.promise
      inFlight--
      return successfulSendResult()
    })
    const delivery = deliverClaimedNotificationPushIntent(
      intent,
      { ...notificationPushDeliveryPolicy, renewalMs: shortLeasePolicy.renewalMs },
      {
        renew: async () => {
          if (++renewals > 1) schedulingObserved.resolve()
          return true
        },
      },
    )
    try {
      await schedulingObserved.promise
      expect(maxInFlight).toBe(endpointConcurrency)
    } finally {
      releaseSends.resolve()
      await delivery
    }
  })
  it('rethrows persistence failures after settling and treats final transition false as ownership loss', async () => {
    const failing = await createDelivery()
    const agent = new Agent()
    const destroy = vi.spyOn(agent, 'destroy')
    vi.mocked(webpush.sendNotification).mockResolvedValue(successfulSendResult())
    await expect(
      deliverClaimedNotificationPushIntent(failing.intent, shortLeasePolicy, {
        createAgent: () => agent,
        persist: async () => {
          throw new Error('persist failed')
        },
      }),
    ).rejects.toThrow('persist failed')
    expect(destroy).toHaveBeenCalled()

    const final = await createDelivery()
    await expect(
      deliverClaimedNotificationPushIntent(final.intent, shortLeasePolicy, {
        markDelivered: async () => false,
      }),
    ).resolves.toEqual({ delivered: 0, suppressed: false })

    const retry = await createDelivery()
    vi.mocked(webpush.sendNotification).mockRejectedValue(
      Object.assign(new Error('retry'), { statusCode: 500 }),
    )
    await expect(
      deliverClaimedNotificationPushIntent(retry.intent, shortLeasePolicy, {
        release: async () => false,
      }),
    ).resolves.toEqual({ delivered: 0, suppressed: false })
  })

  it.each([false, new Error('renew failed')])(
    'stops before finalization when renewal is %s',
    async renewal => {
      const { intent } = await createDelivery()
      const agent = new Agent()
      const destroy = vi.spyOn(agent, 'destroy')
      let finalized = 0
      let renewals = 0
      let rejectSend!: (error: Error) => void
      const renewalStarted = Promise.withResolvers<void>()
      destroy.mockImplementation(() => {
        rejectSend(new Error('agent destroyed'))
        return agent
      })
      vi.mocked(webpush.sendNotification).mockImplementation(async () => {
        await new Promise<never>((_resolve, reject) => {
          rejectSend = reject
        })
        throw new Error('unreachable')
      })
      const delivery = deliverClaimedNotificationPushIntent(
        intent,
        {
          ...shortLeasePolicy,
          endpointConcurrency: 1,
        },
        {
          createAgent: () => agent,
          renew: async () => {
            if (++renewals === 1) return true
            renewalStarted.resolve()
            if (renewal instanceof Error) throw renewal
            return renewal
          },
          markDelivered: async () => {
            finalized++
            return true
          },
        },
      )
      const settled = delivery.then(
        value => ({ value, error: undefined }),
        error => ({ value: undefined, error }),
      )
      await renewalStarted.promise
      const result = await settled
      const observed = {
        value: result.value,
        errorMessage: result.error instanceof Error ? result.error.message : undefined,
      }
      expect(observed).toEqual(
        renewal instanceof Error
          ? { value: undefined, errorMessage: 'renew failed' }
          : { value: { delivered: 0, suppressed: false }, errorMessage: undefined },
      )
      expect(finalized).toBe(0)
      expect(destroy).toHaveBeenCalled()
    },
  )
})
