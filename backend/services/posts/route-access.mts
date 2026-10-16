import { getPostByAnyCached } from './get-cached.mts'
import type { Post } from './types.mts'
import { BLOCKED_POST_TYPES } from './blocked-post-types.mts'

export function getRouteRootAccessPost(post: Post): Promise<Post | null> {
  if (BLOCKED_POST_TYPES.has(post.post_type)) {
    return Promise.resolve(null)
  }
  if (!post.root_post_id) return Promise.resolve(post)

  return getPostByAnyCached(post.root_post_id).then(rootPost => {
    if (!rootPost || BLOCKED_POST_TYPES.has(rootPost.post_type)) return null
    return rootPost
  })
}

export async function getRouteAccessPost(post: Post): Promise<Post | null> {
  return (await getRouteRootAccessPost(post)) ? post : null
}
