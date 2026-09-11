import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import {
  ACTIVITYPUB_INBOX_DEFAULTS,
  CLEANUP_INTERVAL_MS,
  CLEANUP_PRIORITY,
  RECOVERY_INTERVAL_MS,
  RECOVERY_PRIORITY,
} from '../config.mts'
import { activitypubInbox } from '../queues.mts'
import {
  enqueueCleanupExpiredActivityPubInboxDeliveries,
  enqueueRecoverActivityPubInboxDeliveries,
} from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest('activitypub-inbox', [
  {
    schedulerId: 'activitypub-inbox-recovery',
    repeat: { every: RECOVERY_INTERVAL_MS },
    template: {
      name: 'recoverDeliveries',
      data: {},
      opts: {
        ...ACTIVITYPUB_INBOX_DEFAULTS,
        priority: RECOVERY_PRIORITY,
      } satisfies JobOptions,
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
    stagingHourlyFloor: {
      bypassJustification:
        'Unverified ActivityPub storage is security-bounded to one hour and must be reclaimed promptly.',
    },
    template: {
      name: 'cleanupExpiredDeliveries',
      data: {},
      opts: {
        ...ACTIVITYPUB_INBOX_DEFAULTS,
        priority: CLEANUP_PRIORITY,
      } satisfies JobOptions,
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

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(activitypubInbox, scheduledJobManifest)
}
