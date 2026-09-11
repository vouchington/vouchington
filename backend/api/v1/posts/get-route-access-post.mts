import { getPostByAnyCached } from '@services/entity-fetch'
import type { Post } from '@services/posts'
import { BLOCKED_POST_TYPES } from '@services/posts/check-privacy-access'

export function getRouteRootAccessPost(post: Post): Promise<Post | null> {
  if (BLOCKED_POST_TYPES.has(post.post_type)) {
    return Promise.resolve(null)
  }
  if (!post.root_id) return Promise.resolve(post)

  return getPostByAnyCached(post.root_id).then(rootPost => {
    if (!rootPost || BLOCKED_POST_TYPES.has(rootPost.post_type)) return null
    return rootPost
  })
}

export async function getRouteAccessPost(post: Post): Promise<Post | null> {
  return (await getRouteRootAccessPost(post)) ? post : null
}
