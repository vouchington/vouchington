import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import webpush, { type SendResult } from 'web-push'
import {
  getTestNotificationPushRecoveryEndpointStates,
  getTestNotificationPushRecoveryIntentStates,
  withTestNotificationPushRecoveryBacklog,
} from '@voucha/test-helpers/notification-push-recovery'
import { createTestUserDirect } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { notificationsWorkConfig } from '@services/notifications/work-limits'
import type { ReconcileNotificationPushIntentsData } from '@queues/notifications/enqueues'
import { BACKGROUND_QUEUE_NAME, PRIORITY_DISPATCH, PRIORITY_TASK } from '@queues/background/config'
import { background } from '@queues/background/queues'
import {
  NOTIFICATIONS_DELIVER_PUSH_INTENT_JOB,
  NOTIFICATIONS_RECONCILE_PUSH_INTENTS_JOB,
} from '@queues/background/enqueues/notifications-jobs'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { getOrCreateQueue } from '@vouchington/worker-runtime/testing'
import { upsertWebPushSubscription } from '@services/notifications/push-subscriptions'
import {
  processDeliverNotificationPushIntent,
  processReconcileNotificationPushIntents,
} from './processors.mts'

vi.mock<typeof import('web-push')>(import('web-push'), async importActual => {
  const actual = await importActual()
  const mockedModule = {
    ...actual,
    sendNotification: vi.fn<typeof actual.sendNotification>(),
    setVapidDetails: vi.fn<typeof actual.setVapidDetails>(),
  }
  return { ...mockedModule, default: mockedModule }
})
type DeliveryData = { userId: string; notificationId: string }
async function recoveryJobs(userId: string) {
  const jobs = await readAllQueueJobs(background)
  return {
    deliveries: jobs.filter(
      job =>
        job.name === NOTIFICATIONS_DELIVER_PUSH_INTENT_JOB.name &&
        (job.data as DeliveryData).userId === userId,
    ),
    continuations: jobs.filter(
      job =>
        job.name === NOTIFICATIONS_RECONCILE_PUSH_INTENTS_JOB.name &&
        (job.data as ReconcileNotificationPushIntentsData).after?.userId === userId,
    ),
  }
}
describe('notification push-intent recovery across pages', () => {
  let restoreWorkLimits: (() => void) | undefined
  beforeEach(() => {
    restoreWorkLimits = overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
      push_intent_recovery_page_size: 2,
    })
    vi.stubEnv('WEB_PUSH_PUBLIC_KEY', 'test-public-key')
    vi.stubEnv('WEB_PUSH_PRIVATE_KEY', 'test-private-key')
    vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:tests+push-recovery-pages@voucha.ai')
    vi.mocked(webpush.sendNotification).mockReset()
    vi.mocked(webpush.sendNotification).mockResolvedValue(successfulSendResult())
  })
  afterEach(() => {
    restoreWorkLimits?.()
    vi.unstubAllEnvs()
  })
  it('drains distinct 2-item and 1-item pages without resending a successful endpoint', async () => {
    const recipient = await createTestUserDirect()
    let notificationIds: readonly string[] = []
    await withTestNotificationPushRecoveryBacklog(
      { userId: recipient.id, count: 3, neighborCount: 1 },
      async fixture => {
        notificationIds = fixture.notificationIds
        try {
          await expect(
            processReconcileNotificationPushIntents(
              { scanBefore: fixture.scanBefore, after: fixture.after },
              fixture.notificationIds,
            ),
          ).resolves.toEqual({ enqueued: 2 })
          const firstJobs = await recoveryJobs(recipient.id)
          const firstPage = firstJobs.deliveries
            .map(job => ({ data: job.data as DeliveryData, opts: job.opts, name: job.name }))
            .toSorted((a, b) => a.data.notificationId.localeCompare(b.data.notificationId))
          expect(firstPage.map(delivery => delivery.data)).toEqual(
            fixture.notificationIds
              .slice(0, 2)
              .map(notificationId => ({ userId: recipient.id, notificationId })),
          )
          expect(firstJobs.continuations).toHaveLength(1)
          const firstContinuation = firstJobs.continuations[0]!
          expect(firstContinuation.data).toEqual({
            scanBefore: fixture.scanBefore,
            after: {
              updatedAt: fixture.scanBefore,
              userId: recipient.id,
              notificationId: fixture.notificationIds[1],
            },
          })
          for (const delivery of firstPage) {
            expect(delivery).toMatchObject({
              name: 'notifications.processDeliverNotificationPushIntent',
              opts: { priority: PRIORITY_TASK },
            })
          }
          expect(firstContinuation).toMatchObject({
            name: 'notifications.processReconcileNotificationPushIntents',
            opts: { priority: PRIORITY_DISPATCH },
          })
          const pendingStates = fixture.notificationIds.map(notification_id => ({
            notification_id,
            status: 'pending',
          }))
          await expect(
            getTestNotificationPushRecoveryIntentStates({
              userId: recipient.id,
              notificationIds: fixture.notificationIds,
            }),
          ).resolves.toEqual(pendingStates)
          await expect(
            processReconcileNotificationPushIntents(
              firstContinuation.data as ReconcileNotificationPushIntentsData,
              fixture.notificationIds,
            ),
          ).resolves.toEqual({ enqueued: 1 })
          const secondJobs = await recoveryJobs(recipient.id)
          const secondPage = secondJobs.deliveries.filter(
            job => (job.data as DeliveryData).notificationId === fixture.notificationIds[2],
          )
          expect(secondPage.map(job => job.data)).toEqual([
            { userId: recipient.id, notificationId: fixture.notificationIds[2] },
          ])
          expect(secondJobs.deliveries).toHaveLength(3)
          expect(secondJobs.continuations).toHaveLength(1)
          expect(secondPage[0]).toMatchObject({
            name: 'notifications.processDeliverNotificationPushIntent',
            opts: { priority: PRIORITY_TASK },
          })
          for (const enqueue of firstPage.slice(0, 1)) {
            await expect(processDeliverNotificationPushIntent(enqueue.data)).resolves.toEqual({
              delivered: 0,
              suppressed: false,
            })
          }
          const partialDelivery = firstPage[1]!
          const successfulEndpoint = `https://push.example.com/recovery-success/${recipient.id}`
          const retryableEndpoint = `https://push.example.com/recovery-retry/${recipient.id}`
          const [successfulSubscription, retryableSubscription] = await Promise.all([
            createSubscription(recipient.id, successfulEndpoint),
            createSubscription(recipient.id, retryableEndpoint),
          ])
          vi.mocked(webpush.sendNotification).mockImplementation(async (subscription, payload) => {
            if (typeof payload !== 'string') throw new TypeError('expected string web push payload')
            const notificationId = JSON.parse(payload).notification_id as string
            if (
              notificationId === partialDelivery.data.notificationId &&
              subscription.endpoint === retryableEndpoint
            ) {
              throw Object.assign(new Error('retryable web push failure'), { statusCode: 500 })
            }
            return successfulSendResult()
          })

          await expect(processDeliverNotificationPushIntent(partialDelivery.data)).rejects.toThrow(
            'Transient web push delivery failure',
          )
          expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
          await expect(
            getTestNotificationPushRecoveryEndpointStates({
              userId: recipient.id,
              notificationIds: [partialDelivery.data.notificationId],
            }),
          ).resolves.toEqual([
            {
              notification_id: partialDelivery.data.notificationId,
              subscription_id: successfulSubscription.id,
              endpoint: successfulEndpoint,
              status: 'delivered',
            },
          ])
          vi.mocked(webpush.sendNotification).mockImplementation(async () => successfulSendResult())
          await expect(processDeliverNotificationPushIntent(partialDelivery.data)).resolves.toEqual(
            {
              delivered: 1,
              suppressed: false,
            },
          )
          expect(webpush.sendNotification).toHaveBeenCalledTimes(3)
          expect(webpush.sendNotification).toHaveBeenLastCalledWith(
            expect.objectContaining({ endpoint: retryableEndpoint }),
            expect.any(String),
            expect.objectContaining({ agent: expect.anything(), timeout: 30_000 }),
          )
          await expect(
            processDeliverNotificationPushIntent(secondPage[0]!.data as DeliveryData),
          ).resolves.toEqual({
            delivered: 2,
            suppressed: false,
          })
          await expect(
            getTestNotificationPushRecoveryIntentStates({
              userId: recipient.id,
              notificationIds: fixture.notificationIds,
            }),
          ).resolves.toEqual(
            fixture.notificationIds.map(notificationId => ({
              notification_id: notificationId,
              status: 'delivered',
            })),
          )
          await expect(
            getTestNotificationPushRecoveryEndpointStates({
              userId: recipient.id,
              notificationIds: [partialDelivery.data.notificationId],
            }),
          ).resolves.toEqual([
            {
              notification_id: partialDelivery.data.notificationId,
              subscription_id: retryableSubscription.id,
              endpoint: retryableEndpoint,
              status: 'delivered',
            },
            {
              notification_id: partialDelivery.data.notificationId,
              subscription_id: successfulSubscription.id,
              endpoint: successfulEndpoint,
              status: 'delivered',
            },
          ])
          await expect(
            getTestNotificationPushRecoveryIntentStates({
              userId: recipient.id,
              notificationIds: fixture.neighborNotificationIds,
            }),
          ).resolves.toEqual([
            { notification_id: fixture.neighborNotificationIds[0], status: 'pending' },
          ])
          expect(
            (await recoveryJobs(recipient.id)).deliveries.map(job => job.data),
          ).not.toContainEqual({
            userId: recipient.id,
            notificationId: fixture.neighborNotificationIds[0],
          })
        } finally {
          await deleteRecoveryJobs(recipient.id)
        }
      },
    )

    await expect(
      getTestNotificationPushRecoveryIntentStates({ userId: recipient.id, notificationIds }),
    ).resolves.toEqual([])
  })
})

async function createSubscription(userId: string, endpoint: string) {
  return upsertWebPushSubscription({
    userId,
    endpoint,
    p256dh: `${endpoint}-p256dh-secret`,
    auth: `${endpoint}-auth-secret`,
    expirationTimeMs: null,
    userAgent: 'vitest',
  })
}
function successfulSendResult(): SendResult {
  return { statusCode: 201, body: '', headers: {} }
}
async function deleteRecoveryJobs(userId: string): Promise<void> {
  const { deliveries, continuations } = await recoveryJobs(userId)
  const jobIds = new Set([...deliveries, ...continuations].map(job => job.id))
  const queue = getOrCreateQueue(BACKGROUND_QUEUE_NAME)
  for (const jobId of jobIds) queue.jobs.delete(jobId)
  for (let index = queue.waitingQueue.length - 1; index >= 0; index -= 1) {
    if (jobIds.has(queue.waitingQueue[index]!.id)) queue.waitingQueue.splice(index, 1)
  }
  await expect(Promise.all([...jobIds].map(jobId => background.getJob(jobId)))).resolves.toEqual(
    [...jobIds].map(() => null),
  )
}
