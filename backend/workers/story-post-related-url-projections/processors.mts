import { enqueueContinueStoryPostRelatedUrlProjectionReconciliation } from '@queues/story-post-related-url-projections/enqueues'
import { reconcileStoryPostRelatedUrlProjection } from '@services/stories/story-post-related-url-projection'
import type { Job } from 'glide-mq'

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
