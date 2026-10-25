import { ENQUEUE_BASE_DEFAULTS } from '@data-stores/valkey-glide-mq'
import { defineScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { toSchedulerTemplateOptions } from '@vouchington/worker-runtime/schedule-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB } from '@queues/background/enqueues/story-post-related-url-projections-jobs'
import { enqueueReconcileStoryPostRelatedUrlProjections } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'reconcileStoryPostRelatedUrlProjections',
    registration: 'sequential',
    repeat: { every: 300_000 },
    template: {
      name: STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...ENQUEUE_BASE_DEFAULTS,
        ...STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB.options,
      }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcileStoryPostRelatedUrlProjections',
        schedule: 'every 5m',
        description: 'Drain durable story post related URL projections',
        trigger: enqueueReconcileStoryPostRelatedUrlProjections,
      },
    ],
  },
])
