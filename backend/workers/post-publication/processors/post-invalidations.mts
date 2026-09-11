import type { invalidatePostStrict } from '@services/entity-cache/invalidate-strict'
import type { invalidatePostPublicSurfacesStrict } from '@services/posts/public-surfaces'
import type { ReconciliationPost } from '@services/post-publication/reconcile'

export async function invalidateReconciledPostSurfaces(
  posts: readonly ReconciliationPost[],
  orphanReceiptPostIds: readonly string[],
  topicIds: string[],
  invalidatePost: typeof invalidatePostStrict,
  invalidatePostPublicSurfaces: typeof invalidatePostPublicSurfacesStrict,
): Promise<void> {
  const metricPostIds = [
    ...new Set(
      posts.flatMap(post =>
        [post.id, post.parent_id, post.root_id].filter((id): id is string => !!id),
      ),
    ),
  ]
  await Promise.all([
    metricPostIds.length > 0 ? invalidatePost(...metricPostIds) : Promise.resolve(),
    ...posts.map(post => invalidatePostPublicSurfaces(post, topicIds)),
    ...orphanReceiptPostIds.map(id =>
      Promise.all([
        invalidatePost(id),
        invalidatePostPublicSurfaces({ id, created_by_id: null, community_id: null }, topicIds),
      ]),
    ),
  ])
}
