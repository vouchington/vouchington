import { enqueueContinueStoryPostRelatedUrlProjectionReconciliation } from '@queues/story-post-related-url-projections/enqueues'
import { reconcileStoryPostRelatedUrlProjection } from '@services/stories/story-post-related-url-projection'

export async function processReconcileStoryPostRelatedUrlProjections(): Promise<{
  processed: number
}> {
  const result = await reconcileStoryPostRelatedUrlProjection()
  if (result.continue) await enqueueContinueStoryPostRelatedUrlProjectionReconciliation()
  return { processed: result.processed }
}
