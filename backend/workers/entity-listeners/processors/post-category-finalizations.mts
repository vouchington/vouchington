import { enqueueContinuePostCategoryFinalizations } from '@queues/entity-listeners/enqueues'
import {
  POST_CATEGORY_FINALIZATION_BATCH_SIZE,
  reconcilePostCategoryFinalizations,
} from '@services/posts/post-category-finalizations'

type PostCategoryFinalizationDependencies = {
  enqueueContinuePostCategoryFinalizations: typeof enqueueContinuePostCategoryFinalizations
  reconcilePostCategoryFinalizations: typeof reconcilePostCategoryFinalizations
}

/** Replays one bounded page and chains another only after every row finalizes successfully. */
export const processReconcilePostCategoryFinalizations = async (
  _data: Record<string, never>,
  dependencies?: Partial<PostCategoryFinalizationDependencies>,
) => {
  const reconcile =
    dependencies?.reconcilePostCategoryFinalizations ?? reconcilePostCategoryFinalizations
  const enqueueContinuation =
    dependencies?.enqueueContinuePostCategoryFinalizations ??
    enqueueContinuePostCategoryFinalizations
  const result = await reconcile()
  if (result.reconciled === POST_CATEGORY_FINALIZATION_BATCH_SIZE) {
    await enqueueContinuation()
  }
  return result
}
