import { enqueueBulkRefreshPostMetricsById } from '@queues/vote-aggregation/enqueues/entity-metrics-cache-refresh'
import { invalidate } from '@services/entity-cache/invalidate'

/**
 * A comment changes only two stored metrics above it: its parent's `children` and the thread
 * root's `descendants`. Posts between them carry neither, so the refresh names exactly the parent
 * and the root and never walks the thread. The ancestor trail route is `private, no-store`, so no
 * cache holds a rendered reply chain that this would need to clear.
 */
export async function handlePostCommentAction(
  post?: { parent_post_id?: string | null; root_post_id: string | null } | null,
): Promise<void> {
  if (!post?.parent_post_id) return
  const affectedIds = [...new Set([post.parent_post_id, post.root_post_id ?? post.parent_post_id])]
  await enqueueBulkRefreshPostMetricsById(affectedIds)
  await invalidate.posts(...affectedIds)
}
