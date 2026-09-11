import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import {
  SES_INBOUND_QUEUE_NAME,
  SES_INBOUND_RECONCILE_INTERVAL_MS,
  SES_INBOUND_RECONCILE_PRIORITY,
  SES_INBOUND_RECONCILE_ORDERING,
  SES_INBOUND_RECONCILE_JOB_NAME,
} from '../config.mts'
import { sesInboundQueue } from '../queues.mts'
import { enqueueSesInboundReconcile } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(SES_INBOUND_QUEUE_NAME, [
  {
    schedulerId: 'ses-inbound-reconciliation',
    repeat: { every: SES_INBOUND_RECONCILE_INTERVAL_MS },
    template: {
      name: SES_INBOUND_RECONCILE_JOB_NAME,
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: SES_INBOUND_RECONCILE_PRIORITY,
        ordering: SES_INBOUND_RECONCILE_ORDERING,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'ses-inbound-reconciliation',
        schedule: 'every 5m',
        description: 'Recover raw inbound support emails still present in S3',
        trigger: enqueueSesInboundReconcile,
      },
      { kind: 'backfill', backfillId: 'ses-inbound-reconciliation' },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(sesInboundQueue, scheduledJobManifest)
}
