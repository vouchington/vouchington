import { beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Agent } from 'node:https'
import * as webpush from 'web-push'
import {
  answerPostgresWritesForTest,
  rejectPostgresWriteForTest,
  runAfterPostgresWriteForTest,
} from '@voucha/test-helpers/injected-failures'
import { deliverClaimedNotificationPushIntent } from './push-intent-delivery.mts'
import { claimNotificationPushIntent, releaseNotificationPushIntent } from './push-intents.mts'
import type { NotificationPushDeliveryPolicy } from './push-intent-delivery-policy.mts'
import {
  createDelivery,
  getIntentState,
  getLeaseExpiry,
  successfulSendResult,
} from '@voucha/test-helpers/notification-push-fixtures'

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
  return mockedModule
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
    const promptPersisted = Promise.withResolvers<void>()
    const releaseSlow = Promise.withResolvers<void>()
    let slowSettled = false
    vi.mocked(webpush.sendNotification).mockImplementation(async subscription => {
      if (subscription.endpoint === prompt) return successfulSendResult()
      await releaseSlow.promise
      slowSettled = true
      return successfulSendResult()
    })
    onTestFinished(
      runAfterPostgresWriteForTest((statement, values, result) => {
        if (
          !statement.includes('persistClaimedNotificationPushOutcome') ||
          !values.includes(promptSubscriptionId)
        )
          return
        const outcome = result.rows[0]?.outcome
        if (outcome === 'persisted') promptPersisted.resolve()
        else
          promptPersisted.reject(new Error(`notification push persist returned ${String(outcome)}`))
      }),
    )
    const delivery = deliverClaimedNotificationPushIntent(intent)
    try {
      await promptPersisted.promise
      expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
      expect(slowSettled).toBe(false)
    } finally {
      releaseSlow.resolve()
    }
    await expect(delivery).resolves.toEqual({ delivered: 2, suppressed: false })
    expect(slow).not.toBe(prompt)
  })
  it('renews a short lease and retries only the unresolved endpoint', async () => {
    const expectedError = 'Transient web push delivery failure'
    const { intent, prompt, promptSubscriptionId, slow } = await createDelivery(1)
    const originalLeaseExpiry = await getLeaseExpiry(intent)
    const slowSend = Promise.withResolvers<void>()
    const periodicRenewal = Promise.withResolvers<void>()
    const promptPersisted = Promise.withResolvers<void>()
    let acceptedRenewals = 0
    onTestFinished(
      runAfterPostgresWriteForTest((statement, values, result) => {
        if (!values.includes(intent.lease_token)) return
        if (statement.includes('renewNotificationPushIntentLease') && result.rowCount === 1) {
          if (++acceptedRenewals === 2) periodicRenewal.resolve()
        }
        if (
          statement.includes('persistClaimedNotificationPushOutcome') &&
          values.includes(promptSubscriptionId)
        )
          promptPersisted.resolve()
      }),
    )
    vi.mocked(webpush.sendNotification).mockImplementation(async subscription => {
      if (subscription.endpoint === prompt) return successfulSendResult()
      await slowSend.promise
      throw Object.assign(new Error('provider unavailable'), { statusCode: 500 })
    })
    const deliveryRejection = deliverClaimedNotificationPushIntent(intent, shortLeasePolicy).catch(
      (err: unknown) => err,
    )
    try {
      await periodicRenewal.promise
      await promptPersisted.promise
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
    expect(await deliveryRejection).toMatchObject({
      message: expect.stringContaining(expectedError),
    })
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
    const rejectSlow = Promise.withResolvers<never>()
    let slowStarted = false
    const agent = watchSendAgent(() => rejectSlow.reject(new Error('agent destroyed')))
    vi.mocked(webpush.sendNotification).mockImplementation(
      async (subscription, _payload, options) => {
        agent.watch(options)
        if (subscription.endpoint === prompt) {
          await releaseNotificationPushIntent(intent)
          return successfulSendResult()
        }
        slowStarted = true
        return rejectSlow.promise
      },
    )

    await expect(deliverClaimedNotificationPushIntent(intent, shortLeasePolicy)).resolves.toEqual({
      delivered: 0,
      suppressed: false,
    })
    expect(slowStarted).toBe(true)
    expect(agent.destroy).toHaveBeenCalled()
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
  })

  it('suppresses queued mappers after a first persistence loss', async () => {
    const { intent } = await createDelivery(120, 3)
    vi.mocked(webpush.sendNotification).mockImplementation(async () => {
      await releaseNotificationPushIntent(intent)
      return successfulSendResult()
    })
    await expect(
      deliverClaimedNotificationPushIntent(intent, { ...shortLeasePolicy, endpointConcurrency: 1 }),
    ).resolves.toEqual({ delivered: 0, suppressed: false })
    expect(webpush.sendNotification).toHaveBeenCalledOnce()
  })

  it('rethrows persistence failures after settling and destroys the agent', async () => {
    const { intent } = await createDelivery()
    const agent = watchSendAgent(() => {})
    vi.mocked(webpush.sendNotification).mockImplementation(
      async (_subscription, _payload, options) => {
        agent.watch(options)
        return successfulSendResult()
      },
    )
    onTestFinished(
      rejectPostgresWriteForTest(
        'persistClaimedNotificationPushOutcome',
        new Error('persist failed'),
      ),
    )
    await expect(deliverClaimedNotificationPushIntent(intent, shortLeasePolicy)).rejects.toThrow(
      'persist failed',
    )
    expect(agent.destroy).toHaveBeenCalled()
  })

  it('treats a rejected final delivered transition as ownership loss', async () => {
    const { intent } = await createDelivery()
    vi.mocked(webpush.sendNotification).mockResolvedValue(successfulSendResult())
    onTestFinished(
      answerPostgresWritesForTest('markNotificationPushIntentDelivered', [[{ completed: false }]]),
    )
    await expect(deliverClaimedNotificationPushIntent(intent, shortLeasePolicy)).resolves.toEqual({
      delivered: 0,
      suppressed: false,
    })
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
  })

  it('treats a rejected retry release as ownership loss', async () => {
    const { intent } = await createDelivery()
    vi.mocked(webpush.sendNotification).mockRejectedValue(
      Object.assign(new Error('retry'), { statusCode: 500 }),
    )
    onTestFinished(answerPostgresWritesForTest('releaseNotificationPushIntent', [[]]))
    await expect(deliverClaimedNotificationPushIntent(intent, shortLeasePolicy)).resolves.toEqual({
      delivered: 0,
      suppressed: false,
    })
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
  })

  it.each([false, new Error('renew failed')])(
    'stops before finalization when renewal is %s',
    async renewal => {
      const { intent } = await createDelivery()
      const before = await getIntentState(intent)
      const rejectSend = Promise.withResolvers<never>()
      const agent = watchSendAgent(() => rejectSend.reject(new Error('agent destroyed')))
      vi.mocked(webpush.sendNotification).mockImplementation(
        async (_subscription, _payload, options) => {
          agent.watch(options)
          return rejectSend.promise
        },
      )
      let renewals = 0
      onTestFinished(
        renewal instanceof Error
          ? rejectPostgresWriteForTest(
              'renewNotificationPushIntentLease',
              renewal,
              () => ++renewals === 2,
            )
          : answerPostgresWritesForTest('renewNotificationPushIntentLease', [undefined, []]),
      )
      const delivery = deliverClaimedNotificationPushIntent(intent, {
        ...shortLeasePolicy,
        endpointConcurrency: 1,
      })
      const settled = await delivery
        .then(value => ({ value, errorMessage: undefined }))
        .catch((err: unknown) => ({
          value: undefined,
          errorMessage: err instanceof Error ? err.message : undefined,
        }))
      expect(settled).toEqual(
        renewal instanceof Error
          ? { value: undefined, errorMessage: 'renew failed' }
          : { value: { delivered: 0, suppressed: false }, errorMessage: undefined },
      )
      expect(agent.destroy).toHaveBeenCalled()
      await expect(getIntentState(intent)).resolves.toEqual(before)
    },
  )
})

/** Spies on the real agent production hands to `sendNotification`, calling through to destroy it. */
function watchSendAgent(onDestroy: () => void) {
  const destroy = vi.fn<() => void>()
  let watched = false
  return {
    destroy,
    watch(options: unknown) {
      if (watched) return
      watched = true
      const agent = (options as { agent: Agent }).agent
      const realDestroy = agent.destroy
      vi.spyOn(agent, 'destroy').mockImplementation(() => {
        destroy()
        onDestroy()
        Reflect.apply(realDestroy, agent, [])
      })
    },
  }
}
