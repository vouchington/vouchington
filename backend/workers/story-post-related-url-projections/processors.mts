import { enqueueContinueStoryPostRelatedUrlProjectionReconciliation } from '@queues/story-post-related-url-projections/enqueues'
import { reconcileStoryPostRelatedUrlProjection } from '@services/stories/story-post-related-url-projection'
import type { Job } from 'glide-mq'

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/queues/workers/story-post-related-url-projections/README.md`.
 */
export async function processReconcileStoryPostRelatedUrlProjections(
  dependencies: {
    reconcileStoryPostRelatedUrlProjection: typeof reconcileStoryPostRelatedUrlProjection
    enqueueContinueStoryPostRelatedUrlProjectionReconciliation: typeof enqueueContinueStoryPostRelatedUrlProjectionReconciliation
  } = {
    reconcileStoryPostRelatedUrlProjection,
    enqueueContinueStoryPostRelatedUrlProjectionReconciliation,
  },
): Promise<{ processed: number }> {
  const result = await dependencies.reconcileStoryPostRelatedUrlProjection()
  if (result.continue)
    await dependencies.enqueueContinueStoryPostRelatedUrlProjectionReconciliation()
  return { processed: result.processed }
}

export function processStoryPostRelatedUrlProjectionJob(
  job: Pick<Job, 'name'>,
  processReconciliation = processReconcileStoryPostRelatedUrlProjections,
) {
  if (job.name !== 'processReconcileStoryPostRelatedUrlProjections')
    throw new Error(`Story post related URL projection job ${job.name} not found`)
  return processReconciliation()
}
