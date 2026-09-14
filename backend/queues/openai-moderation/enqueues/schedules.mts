import { ENQUEUE_BASE_DEFAULTS } from '@data-stores/valkey-glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import type { JobOptions } from 'glide-mq'
import {
  IMAGE_QUARANTINE_RECONCILIATION_DEDUPLICATION_ID,
  POST_MODERATION_RECONCILIATION_DEDUPLICATION_ID,
  MODERATION_OMNI_SINGLE_QUEUE_NAME,
  PRIORITY_RECONCILIATION,
} from '../config.mts'
import { enqueueReconcileImageQuarantines, enqueueReconcilePostModeration } from '../enqueues.mts'
import { openai_moderation_omni_single } from '../queues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(MODERATION_OMNI_SINGLE_QUEUE_NAME, [
  {
    schedulerId: 'reconcile-image-quarantines',
    registration: 'sequential',
    repeat: { every: 60_000 },
    template: {
      name: 'reconcile_image_quarantines',
      data: {},
      opts: {
        ...ENQUEUE_BASE_DEFAULTS,
        attempts: 1,
        priority: PRIORITY_RECONCILIATION,
        deduplication: {
          id: IMAGE_QUARANTINE_RECONCILIATION_DEDUPLICATION_ID,
          mode: 'throttle',
          ttl: 60_000,
        },
      } satisfies JobOptions,
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
      name: 'reconcile_post_moderation',
      data: {},
      opts: {
        ...ENQUEUE_BASE_DEFAULTS,
        attempts: 1,
        priority: PRIORITY_RECONCILIATION,
        deduplication: {
          id: POST_MODERATION_RECONCILIATION_DEDUPLICATION_ID,
          mode: 'throttle',
          ttl: 60_000,
        },
      } satisfies JobOptions,
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

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(openai_moderation_omni_single, scheduledJobManifest)
}
