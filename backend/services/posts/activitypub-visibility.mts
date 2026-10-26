import { withPrimaryReads } from '@data-stores/psql'
import { getPostByAny } from './get.mts'
import { getRouteRootAccessPost } from './route-access.mts'
import { canViewPostsBatch } from './check-privacy-access.mts'

// The same anonymous-viewer policy gates initial Like admission and every later distribution
// page. A post can become private after the ballot commit or after a page is queued.
export async function canDistributeActivityPubLike(postId: string): Promise<boolean> {
  // A replica or post cache can lag a newly approved post during recovery. A false result
  // terminally completes the Like, so resolve both the post and its anonymous access on primary.
  return withPrimaryReads(async () => {
    const votedPost = await getPostByAny(postId)
    if (!votedPost) return false
    const loadedRoot = votedPost.root_post_id
      ? await getPostByAny(votedPost.root_post_id)
      : votedPost
    const rootPost = await getRouteRootAccessPost(votedPost, loadedRoot)
    if (!rootPost) return false
    const visible = await canViewPostsBatch(
      null,
      rootPost.id === votedPost.id ? [votedPost] : [votedPost, rootPost],
    )
    return Boolean(visible.get(votedPost.id) && visible.get(rootPost.id))
  })
}
