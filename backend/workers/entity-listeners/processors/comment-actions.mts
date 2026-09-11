import { enqueueBulkRefreshPostMetricsById } from '@queues/entity-metrics-cache-refresh/enqueues'
import { getCommentAncestorIds } from '@services/comments'
import { invalidate } from '@services/entity-cache/invalidate'

export async function handlePostCommentAction(postId?: string): Promise<void> {
  if (!postId) return
  const ancestorIds = await getCommentAncestorIds(postId)
  if (ancestorIds.length === 0) return
  await enqueueBulkRefreshPostMetricsById(ancestorIds)
  await invalidate.posts(...ancestorIds)
}
