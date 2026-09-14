import { reconcileStoryPostRelatedUrlProjection } from '../../../services/stories/story-post-related-url-projection.mts'

export async function drainStoryPostRelatedUrlProjection(postId: string): Promise<void> {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const result = await reconcileStoryPostRelatedUrlProjection({ postId })
    if (!result.continue) return
  }
  throw new Error(`Story post related URL projection for ${postId} did not drain`)
}
