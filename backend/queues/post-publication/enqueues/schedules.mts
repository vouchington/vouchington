import { ENQUEUE_BASE_DEFAULTS } from '@data-stores/valkey-glide-mq'
import {
  defineScheduledJobManifest,
  toSchedulerTemplateOptions,
} from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { POST_PUBLICATION_RECONCILE_JOB } from '@queues/background/enqueues/post-publication-jobs'
import { enqueueReconcilePostPublication } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'reconcile-post-publication',
    registration: 'sequential',
    repeat: { every: 300_000 },
    template: {
      name: POST_PUBLICATION_RECONCILE_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...ENQUEUE_BASE_DEFAULTS,
        ...POST_PUBLICATION_RECONCILE_JOB.options,
      }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcile-post-publication',
        schedule: 'every 5m',
        description: 'Drain durable post publication reconciliation work',
        trigger: enqueueReconcilePostPublication,
      },
    ],
  },
])
