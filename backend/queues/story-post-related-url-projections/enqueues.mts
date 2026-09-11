import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import onError from '@modules/on-error'
import {
  PRIORITY_RECOVERY,
  QUEUE_NAME,
  RECOVERY_DEDUPLICATION_ID,
  RECOVERY_DEDUPLICATION_TTL_MS,
  STORY_POST_RELATED_URL_PROJECTION_ORDERING,
} from './config.mts'
import { storyPostRelatedUrlProjections } from './queues.mts'
import type { StoryPostRelatedUrlProjectionJobs } from './types.mts'

const enqueueReconciliationJob = createEnqueueFunction<
  Record<string, never>,
  StoryPostRelatedUrlProjectionJobs
>({
  queue: storyPostRelatedUrlProjections,
  queueName: QUEUE_NAME,
  jobName: 'processReconcileStoryPostRelatedUrlProjections',
})

export function enqueueReconcileStoryPostRelatedUrlProjections(
  options: { deduplicationId?: string } = {},
): EnqueueReturnType {
  return enqueueReconciliationJob(
    {},
    {
      priority: PRIORITY_RECOVERY,
      ordering: STORY_POST_RELATED_URL_PROJECTION_ORDERING.reconciliation,
      deduplication: {
        id: options.deduplicationId ?? RECOVERY_DEDUPLICATION_ID,
        mode: 'throttle',
        ttl: RECOVERY_DEDUPLICATION_TTL_MS,
      },
    },
  )
}

export function enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort(): void {
  void Promise.resolve(enqueueReconcileStoryPostRelatedUrlProjections()).catch(onError)
}

export function enqueueContinueStoryPostRelatedUrlProjectionReconciliation(): EnqueueReturnType {
  return enqueueReconciliationJob(
    {},
    {
      priority: PRIORITY_RECOVERY,
      ordering: STORY_POST_RELATED_URL_PROJECTION_ORDERING.reconciliation,
    },
  )
}
