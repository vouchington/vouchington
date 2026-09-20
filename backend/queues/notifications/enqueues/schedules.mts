import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { notifications } from '../queues.mts'
import { PRIORITY_DEFAULT, QUEUE_NAME } from '../config.mts'
import {
  enqueueCommunityActivityDigestScheduleTick,
  enqueueReconcileCopyrightDeliveryIntents,
  enqueueReconcileNotificationPushIntents,
} from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'copyright-delivery-reconciliation',
    repeat: { pattern: '*/5 * * * *' },
    template: {
      name: 'processReconcileCopyrightDeliveryIntents',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DEFAULT,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'copyright-delivery-reconciliation',
        schedule: '*/5 * * * *',
        description: 'Re-enqueue pending copyright legal delivery intents',
        trigger: enqueueReconcileCopyrightDeliveryIntents,
      },
    ],
  },
  {
    schedulerId: 'notification-push-intent-recovery',
    repeat: { pattern: '*/5 * * * *' },
    template: {
      name: 'processReconcileNotificationPushIntents',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DEFAULT,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'notification-push-intent-recovery',
        schedule: '*/5 * * * *',
        description: 'Re-enqueue pending browser-push intents after a worker or queue failure',
        trigger: enqueueReconcileNotificationPushIntents,
      },
    ],
  },
  {
    schedulerId: 'community-activity-digest-weekly',
    repeat: { pattern: '0 9 * * 1' },
    template: {
      name: 'processCommunityActivityDigestScheduleTick',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DEFAULT,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'community-activity-digest-weekly',
        schedule: '0 9 * * 1',
        description: 'Dispatch weekly community activity notifications',
        trigger: enqueueCommunityActivityDigestScheduleTick,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(notifications, scheduledJobManifest)
}
