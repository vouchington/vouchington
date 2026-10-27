import { processStoryPostRelatedUrlProjectionPage } from '../../../services/stories/story-post-related-url-projection-reconcile.mts'
import { createTestStoryProjectionLease } from '../../entities/story-projection-work.mts'

export async function processOwnedStoryProjectionPage(postId: string) {
  const work = await createTestStoryProjectionLease(postId)
  if (!work) return { processed: 0, continue: false }
  const result = await processStoryPostRelatedUrlProjectionPage(work)
  return { processed: result.processed, continue: result.continue }
}

export async function drainStoryPostRelatedUrlProjection(postId: string): Promise<void> {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const result = await processOwnedStoryProjectionPage(postId)
    if (!result.continue) return
  }
  throw new Error(`Story post related URL projection for ${postId} did not drain`)
}
