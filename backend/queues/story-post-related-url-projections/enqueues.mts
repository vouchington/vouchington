import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB } from '@queues/background/enqueues/story-post-related-url-projections-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import onError from '@modules/on-error'
import { RECOVERY_DEDUPLICATION_ID, RECOVERY_DEDUPLICATION_TTL_MS } from './config.mts'

const enqueueReconciliationJob = createBackgroundEnqueue(
  STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB,
)

export function enqueueReconcileStoryPostRelatedUrlProjections(
  options: { deduplicationId?: string } = {},
): EnqueueReturnType {
  return enqueueReconciliationJob(
    {},
    {
      deduplication: {
        id: options.deduplicationId ?? RECOVERY_DEDUPLICATION_ID,
        mode: 'throttle',
        ttl: RECOVERY_DEDUPLICATION_TTL_MS,
      },
    },
  )
}

export function enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort(
  options: { deduplicationId?: string } = {},
): Promise<void> {
  return Promise.resolve(enqueueReconcileStoryPostRelatedUrlProjections(options)).then(
    () => undefined,
    onError,
  )
}

export function enqueueContinueStoryPostRelatedUrlProjectionReconciliation(): EnqueueReturnType {
  return enqueueReconciliationJob({})
}
