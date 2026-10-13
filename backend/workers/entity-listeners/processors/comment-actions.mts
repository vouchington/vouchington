import { enqueueBulkRefreshPostMetricsById } from '@queues/vote-aggregation/enqueues/entity-metrics-cache-refresh'
import { getCommentAncestorIds } from '@services/comments'
import { invalidate } from '@services/entity-cache/invalidate'

export async function handlePostCommentAction(postId?: string): Promise<void> {
  if (!postId) return
  const ancestorIds = await getCommentAncestorIds(postId)
  if (ancestorIds.length === 0) return
  await enqueueBulkRefreshPostMetricsById(ancestorIds)
  await invalidate.posts(...ancestorIds)
}
