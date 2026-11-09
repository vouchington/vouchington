import { enqueueContinueStoryPostRelatedUrlProjectionReconciliation } from '@queues/story-post-related-url-projections/enqueues'
import { reconcileStoryPostRelatedUrlProjection } from '@services/stories/story-post-related-url-projection'
import { reconcileStoryPostCategoryProjection } from '@services/stories/story-post-category-projection'

export async function processReconcileStoryPostRelatedUrlProjections(
  options: { categoryStoryIds?: readonly string[]; urlPostIds?: readonly string[] } = {},
): Promise<{ processed: number }> {
  const urls = await reconcileStoryPostRelatedUrlProjection(
    options.urlPostIds ? { postIds: options.urlPostIds } : undefined,
  )
  const categories = await reconcileStoryPostCategoryProjection(
    options.categoryStoryIds ? { storyIds: options.categoryStoryIds } : undefined,
  )
  if (urls.continue || categories.continue)
    await enqueueContinueStoryPostRelatedUrlProjectionReconciliation()
  return { processed: urls.processed + categories.processed }
}
