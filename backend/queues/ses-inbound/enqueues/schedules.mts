import {
  defineScheduledJobManifest,
  toSchedulerTemplateOptions,
} from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { SES_INBOUND_RECONCILE_JOB } from '@queues/background/enqueues/ses-inbound-jobs'
import { SES_INBOUND_RECONCILE_INTERVAL_MS } from '../config.mts'
import { enqueueSesInboundReconcile } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'ses-inbound-reconciliation',
    repeat: { every: SES_INBOUND_RECONCILE_INTERVAL_MS },
    template: {
      name: SES_INBOUND_RECONCILE_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        ...SES_INBOUND_RECONCILE_JOB.options,
      }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'ses-inbound-reconciliation',
        schedule: 'every 5m',
        description: 'Recover copyright intake emails still present in S3',
        trigger: enqueueSesInboundReconcile,
      },
      { kind: 'backfill', backfillId: 'ses-inbound-reconciliation' },
    ],
  },
])
