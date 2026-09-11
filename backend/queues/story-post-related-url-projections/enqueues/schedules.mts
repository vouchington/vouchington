import { ENQUEUE_BASE_DEFAULTS } from '@data-stores/valkey-glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import {
  PRIORITY_RECOVERY,
  QUEUE_NAME,
  RECOVERY_DEDUPLICATION_ID,
  RECOVERY_DEDUPLICATION_TTL_MS,
  STORY_POST_RELATED_URL_PROJECTION_ORDERING,
} from '../config.mts'
import { enqueueReconcileStoryPostRelatedUrlProjections } from '../enqueues.mts'
import { storyPostRelatedUrlProjections } from '../queues.mts'
import type { StoryPostRelatedUrlProjectionJobs } from '../types.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'reconcileStoryPostRelatedUrlProjections',
    registration: 'sequential',
    repeat: { every: 300_000 },
    stagingHourlyFloor: {
      bypassJustification: 'Five-minute recovery bounds durable story URL projection.',
    },
    template: {
      name: 'processReconcileStoryPostRelatedUrlProjections' as StoryPostRelatedUrlProjectionJobs,
      data: {},
      opts: {
        ...ENQUEUE_BASE_DEFAULTS,
        priority: PRIORITY_RECOVERY,
        ordering: STORY_POST_RELATED_URL_PROJECTION_ORDERING.reconciliation,
        deduplication: {
          id: RECOVERY_DEDUPLICATION_ID,
          mode: 'throttle',
          ttl: RECOVERY_DEDUPLICATION_TTL_MS,
        },
      },
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

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(storyPostRelatedUrlProjections, scheduledJobManifest)
}
