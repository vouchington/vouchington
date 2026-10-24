import { defineScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { toSchedulerTemplateOptions } from '@vouchington/worker-runtime/schedule-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB,
  ACTIVITYPUB_RECOVER_DELIVERIES_JOB,
} from '@queues/background/enqueues/activitypub-jobs'
import { CLEANUP_INTERVAL_MS, RECOVERY_INTERVAL_MS } from '../config.mts'
import {
  enqueueCleanupExpiredActivityPubInboxDeliveries,
  enqueueRecoverActivityPubInboxDeliveries,
} from './inbox.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'activitypub-inbox-recovery',
    repeat: { every: RECOVERY_INTERVAL_MS },
    template: {
      name: ACTIVITYPUB_RECOVER_DELIVERIES_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({ ...ACTIVITYPUB_RECOVER_DELIVERIES_JOB.options }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'activitypub-inbox-recovery',
        schedule: 'every 5m',
        description: 'Recover abandoned durable ActivityPub inbox envelopes',
        trigger: enqueueRecoverActivityPubInboxDeliveries,
      },
    ],
  },
  {
    schedulerId: 'activitypub-inbox-cleanup',
    repeat: { every: CLEANUP_INTERVAL_MS },
    template: {
      name: ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({ ...ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB.options }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'activitypub-inbox-cleanup',
        schedule: 'every 5m',
        description: 'Delete expired durable ActivityPub inbox envelopes',
        trigger: enqueueCleanupExpiredActivityPubInboxDeliveries,
      },
    ],
  },
])
