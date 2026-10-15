import {
  defineScheduledJobManifest,
  toSchedulerTemplateOptions,
} from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB,
  OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB,
} from '@queues/background/enqueues/openai-moderation-jobs'
import { enqueueReconcileImageQuarantines, enqueueReconcilePostModeration } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'reconcile-image-quarantines',
    registration: 'sequential',
    repeat: { every: 60_000 },
    template: {
      name: OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB.options,
        removeOnComplete: 100,
        removeOnFail: 100,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcile-image-quarantines',
        schedule: 'every 1m',
        description: 'Retry pending CSAM image quarantine transfers',
        trigger: enqueueReconcileImageQuarantines,
      },
    ],
  },
  {
    schedulerId: 'reconcile-post-moderation',
    registration: 'sequential',
    repeat: { every: 60_000 },
    template: {
      name: OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB.options,
        removeOnComplete: 100,
        removeOnFail: 100,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcile-post-moderation',
        schedule: 'every 1m',
        description: 'Retry or fail closed unresolved post moderation work',
        trigger: enqueueReconcilePostModeration,
      },
    ],
  },
])
