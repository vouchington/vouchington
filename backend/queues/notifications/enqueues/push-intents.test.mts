import { describe, expect, it } from 'vitest'
import {
  enqueueContinueNotificationPushIntentReconciliation,
  enqueueDeliverNotificationPushIntent,
  enqueueReconcileNotificationPushIntents,
} from './push-intents.mts'
import { notifications } from '../queues.mts'
import { NOTIFICATIONS_DEDUPLICATION_TTL_MS, PRIORITY_DEFAULT } from '../config.mts'

describe('notification push intent queue wiring', () => {
  it('enqueues a debounced delivery job for one durable intent', async () => {
    const suffix = crypto.randomUUID()
    const userId = `user-${suffix}`
    const notificationId = `notification-${suffix}`

    await enqueueDeliverNotificationPushIntent(userId, notificationId)

    const job = (await notifications.getJobs('waiting')).find(
      candidate =>
        candidate.name === 'processDeliverNotificationPushIntent' &&
        (candidate.data as { userId?: string }).userId === userId,
    )
    expect(job?.data).toEqual({ userId, notificationId })
    expect(job?.opts).toMatchObject({
      priority: PRIORITY_DEFAULT,
      deduplication: {
        id: `processDeliverNotificationPushIntent__${userId}__${notificationId}`,
        mode: 'debounce',
        ttl: NOTIFICATIONS_DEDUPLICATION_TTL_MS,
      },
    })
  })

  it('throttles periodic intent reconciliation to one five-minute schedule', async () => {
    await enqueueReconcileNotificationPushIntents()

    const job = (await notifications.getJobs('waiting')).find(
      candidate => candidate.name === 'processReconcileNotificationPushIntents',
    )
    expect(job?.data).toEqual({})
    expect(job?.opts).toMatchObject({
      priority: PRIORITY_DEFAULT,
      deduplication: {
        id: 'processReconcileNotificationPushIntents',
        mode: 'throttle',
        ttl: 5 * 60 * 1000,
      },
    })
  })

  it('immediately deduplicates one distinct reconciliation snapshot page', async () => {
    const data = {
      scanBefore: '2026-09-06T00:00:00.000Z',
      after: {
        updatedAt: '2026-09-05T23:59:00.000Z',
        userId: '00000000-0000-7000-8000-000000000001',
        notificationId: '00000000-0000-7000-8000-000000000002',
      },
    }
    const job = await enqueueContinueNotificationPushIntentReconciliation(data)

    expect(job).toMatchObject({
      name: 'processReconcileNotificationPushIntents',
      data,
      opts: {
        priority: PRIORITY_DEFAULT,
        deduplication: {
          id: `processReconcileNotificationPushIntentsContinuation__${data.scanBefore}__${data.after.updatedAt}__${data.after.userId}__${data.after.notificationId}`,
          mode: 'throttle',
          ttl: 5 * 60 * 1000,
        },
      },
    })
  })
})
