import { processStoryPostRelatedUrlProjectionPage } from './story-post-related-url-projection-reconcile.mts'
import type { ProjectionResult } from './story-post-related-url-projection-types.mts'
import {
  claimStoryPostRelatedUrlProjectionWork,
  hasClaimableStoryPostRelatedUrlProjectionWork,
} from './story-post-related-url-projection-work.mts'

export async function reconcileStoryPostRelatedUrlProjection(): Promise<ProjectionResult> {
  const work = await claimStoryPostRelatedUrlProjectionWork()
  if (!work) return { processed: 0, continue: false }
  const result = await processStoryPostRelatedUrlProjectionPage(work)
  return {
    processed: result.processed,
    continue: result.completed
      ? await hasClaimableStoryPostRelatedUrlProjectionWork()
      : result.continue,
  }
}
