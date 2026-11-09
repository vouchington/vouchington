import { processStoryPostRelatedUrlProjectionPage } from './story-post-related-url-projection-reconcile.mts'
import type { ProjectionResult } from './story-post-related-url-projection-types.mts'
import {
  claimStoryPostRelatedUrlProjectionWork,
  hasClaimableStoryPostRelatedUrlProjectionWork,
} from './story-post-related-url-projection-work.mts'

export async function reconcileStoryPostRelatedUrlProjection(options?: {
  postIds?: readonly string[]
}): Promise<ProjectionResult> {
  if (options?.postIds?.length === 0) return { processed: 0, continue: false }
  const work = await claimStoryPostRelatedUrlProjectionWork(options)
  if (!work) return { processed: 0, continue: false }
  const result = await processStoryPostRelatedUrlProjectionPage(work)
  return {
    processed: result.processed,
    continue: result.completed
      ? await hasClaimableStoryPostRelatedUrlProjectionWork(options)
      : result.continue,
  }
}
