import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import webpush, { type SendResult } from 'web-push'
import {
  getTestNotificationPushRecoveryEndpointStates,
  getTestNotificationPushRecoveryIntentStates,
  withTestNotificationPushRecoveryBacklog,
} from '@voucha/test-helpers/notification-push-recovery'
import { createTestUserDirect } from '@voucha/test-helpers'
import {
  enqueueContinueNotificationPushIntentReconciliation,
  enqueueDeliverNotificationPushIntent,
} from '@queues/notifications/enqueues'
import { PRIORITY_DEFAULT, QUEUE_NAME } from '@queues/notifications/config'
import { notifications } from '@queues/notifications/queues'
import { readEnqueuedJob } from '@voucha/test-helpers/queue-jobs'
import { upsertWebPushSubscription } from '@services/notifications/push-subscriptions'
import { getOrCreateQueue } from '../../../test-helpers/glide-mq-vitest-internals.mts'
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
type EnqueueResult = { completion?: Promise<unknown>; enqueued?: unknown }
type RecordedEnqueue =
  | ({ kind: 'delivery'; data: { userId: string; notificationId: string } } & EnqueueResult)
  | ({
      kind: 'continuation'
      data: {
        scanBefore: string
        after: { updatedAt: string; userId: string; notificationId: string }
      }
    } & EnqueueResult)

describe('notification push-intent recovery across pages', () => {
  beforeEach(() => {
    vi.stubEnv('WEB_PUSH_PUBLIC_KEY', 'test-public-key')
    vi.stubEnv('WEB_PUSH_PRIVATE_KEY', 'test-private-key')
    vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:tests+push-recovery-pages@voucha.ai')
    vi.mocked(webpush.sendNotification).mockReset()
    vi.mocked(webpush.sendNotification).mockResolvedValue(successfulSendResult())
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  it('drains distinct 100-item and 1-item pages without resending a successful endpoint', async () => {
    const recipient = await createTestUserDirect()
    const enqueues: RecordedEnqueue[] = []
    let notificationIds: readonly string[] = []
    await withTestNotificationPushRecoveryBacklog(
      { userId: recipient.id, count: 101 },
      async fixture => {
        notificationIds = fixture.notificationIds
        try {
          await expect(
            processReconcileNotificationPushIntents(
              { scanBefore: fixture.scanBefore, after: fixture.after },
              recoveryDependencies(enqueues),
            ),
          ).resolves.toEqual({ enqueued: 100 })
          const firstPage = enqueues.filter(
            (enqueue): enqueue is Extract<RecordedEnqueue, { kind: 'delivery' }> =>
              enqueue.kind === 'delivery',
          )
          const firstContinuation = enqueues.find(enqueue => enqueue.kind === 'continuation')
          expect(firstPage).toHaveLength(100)
          expect(firstContinuation).toBeDefined()
          const firstPageNotificationIds = firstPage.map(enqueue => enqueue.data.notificationId)
          expect(firstPageNotificationIds).toEqual(fixture.notificationIds.slice(0, 100))
          expect(enqueues.map(enqueue => enqueue.kind)).toEqual([
            ...Array<string>(100).fill('delivery'),
            'continuation',
          ])
          expectSameTimestamp(firstContinuation!.data.scanBefore, fixture.scanBefore)
          expectSameTimestamp(firstContinuation!.data.after.updatedAt, fixture.scanBefore)
          expect(firstContinuation!.data.after).toMatchObject({
            userId: recipient.id,
            notificationId: fixture.notificationIds[99],
          })
          const firstPageJobs = await Promise.all(
            firstPage.map(enqueue => readEnqueuedJob(notifications, enqueue.enqueued)),
          )
          const continuationJob = await readEnqueuedJob(notifications, firstContinuation!.enqueued)
          for (const job of firstPageJobs) {
            expect(job).toMatchObject({
              name: 'processDeliverNotificationPushIntent',
              opts: { priority: PRIORITY_DEFAULT },
            })
          }
          expect(continuationJob).toMatchObject({
            name: 'processReconcileNotificationPushIntents',
            opts: { priority: PRIORITY_DEFAULT },
          })
          await expect(
            getTestNotificationPushRecoveryIntentStates({
              userId: recipient.id,
              notificationIds: fixture.notificationIds,
            }),
          ).resolves.toEqual(
            fixture.notificationIds.map(notification_id => ({
              notification_id,
              status: 'pending',
            })),
          )
          await expect(
            processReconcileNotificationPushIntents(
              firstContinuation!.data,
              recoveryDependencies(enqueues),
            ),
          ).resolves.toEqual({ enqueued: 1 })
          const secondPage = enqueues
            .filter(
              (enqueue): enqueue is Extract<RecordedEnqueue, { kind: 'delivery' }> =>
                enqueue.kind === 'delivery',
            )
            .slice(100)
          expect(secondPage.map(enqueue => enqueue.data)).toEqual([
            { userId: recipient.id, notificationId: fixture.notificationIds[100] },
          ])
          expect(enqueues.filter(enqueue => enqueue.kind === 'continuation')).toHaveLength(1)
          const secondJob = await readEnqueuedJob(notifications, secondPage[0]!.enqueued)
          expect(secondJob).toMatchObject({
            name: 'processDeliverNotificationPushIntent',
            opts: { priority: PRIORITY_DEFAULT },
          })
          for (const enqueue of firstPage.slice(0, 99)) {
            await expect(processDeliverNotificationPushIntent(enqueue.data)).resolves.toEqual({
              delivered: 0,
              suppressed: false,
            })
          }
          const partialDelivery = firstPage[99]!
          const successfulEndpoint = 'https://push.example.com/recovery-success'
          const retryableEndpoint = 'https://push.example.com/recovery-retry'
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
          await expect(processDeliverNotificationPushIntent(secondPage[0]!.data)).resolves.toEqual({
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
        } finally {
          await deleteRecordedTestQueueJobs(enqueues)
        }
      },
    )

    await expect(
      getTestNotificationPushRecoveryIntentStates({ userId: recipient.id, notificationIds }),
    ).resolves.toEqual([])
  }, 30_000)
})
function recoveryDependencies(enqueues: RecordedEnqueue[]) {
  return {
    enqueueDeliverNotificationPushIntent: (userId: string, notificationId: string) => {
      const recorded: RecordedEnqueue = {
        kind: 'delivery',
        data: { userId, notificationId },
      }
      enqueues.push(recorded)
      recorded.completion = captureEnqueue(
        recorded,
        async () => await enqueueDeliverNotificationPushIntent(userId, notificationId),
      )
      return recorded.completion
    },
    enqueueContinueNotificationPushIntentReconciliation: (data: {
      scanBefore: string
      after: { updatedAt: string; userId: string; notificationId: string }
    }) => {
      const recorded: RecordedEnqueue = { kind: 'continuation', data }
      enqueues.push(recorded)
      recorded.completion = captureEnqueue(
        recorded,
        async () => await enqueueContinueNotificationPushIntentReconciliation(data),
      )
      return recorded.completion
    },
  }
}

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
async function deleteRecordedTestQueueJobs(enqueues: RecordedEnqueue[]): Promise<void> {
  const settledJobs = await Promise.allSettled(
    enqueues.map(async enqueue => readEnqueuedJob(notifications, await enqueue.completion!)),
  )
  const jobIds = settledJobs.flatMap(result =>
    result.status === 'fulfilled' ? [result.value.id] : [],
  )
  const queue = getOrCreateQueue(QUEUE_NAME)
  const ownedJobIds = new Set(jobIds)
  for (const jobId of ownedJobIds) queue.jobs.delete(jobId)
  for (let index = queue.waitingQueue.length - 1; index >= 0; index -= 1) {
    if (ownedJobIds.has(queue.waitingQueue[index]!.id)) queue.waitingQueue.splice(index, 1)
  }
  await expect(Promise.all(jobIds.map(jobId => notifications.getJob(jobId)))).resolves.toEqual(
    jobIds.map(() => null),
  )
}
function expectSameTimestamp(actual: string, expected: string): void {
  expect(new Date(actual).getTime()).toBe(new Date(expected).getTime())
}

async function captureEnqueue(recorded: RecordedEnqueue, enqueue: () => unknown): Promise<unknown> {
  recorded.enqueued = await enqueue()
  return recorded.enqueued
}
