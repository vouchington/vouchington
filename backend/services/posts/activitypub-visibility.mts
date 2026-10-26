import { getPostByAnyCached } from './get-cached.mts'
import { getRouteAccessPost } from './route-access.mts'
import { canViewPostsBatch } from './check-privacy-access.mts'

// The same anonymous-viewer policy gates initial Like admission and every later distribution
// page. A post can become private after the ballot commit or after a page is queued.
export async function canDistributeActivityPubLike(postId: string): Promise<boolean> {
  const votedPost = await getPostByAnyCached(postId)
  if (!votedPost) return false
  const rootPost = await getRouteAccessPost(votedPost)
  if (!rootPost) return false
  const visible = await canViewPostsBatch(
    null,
    rootPost.id === votedPost.id ? [votedPost] : [votedPost, rootPost],
  )
  return Boolean(visible.get(votedPost.id) && visible.get(rootPost.id))
}
