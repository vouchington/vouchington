import { getPostByAnyCached } from './get-cached.mts'
import type { Post } from './types.mts'
import { BLOCKED_POST_TYPES } from './blocked-post-types.mts'
import { getPostsWithRootsByAnyCached } from './get-cached-with-roots.mts'

export async function getRoutePostByAnyCached(identifier: string) {
  const {
    posts: [post],
    roots,
  } = await getPostsWithRootsByAnyCached([identifier])
  return { post: post ?? null, root: roots.find(root => root?.id === post?.root_post_id) ?? null }
}

export function getRouteRootAccessPost(post: Post, loadedRoot?: Post | null): Promise<Post | null> {
  if (BLOCKED_POST_TYPES.has(post.post_type)) {
    return Promise.resolve(null)
  }
  if (!post.root_post_id) return Promise.resolve(post)

  const root =
    loadedRoot === undefined ? getPostByAnyCached(post.root_post_id) : Promise.resolve(loadedRoot)
  return root.then(rootPost => {
    if (!rootPost || BLOCKED_POST_TYPES.has(rootPost.post_type)) return null
    return rootPost
  })
}

export async function getRouteAccessPost(
  post: Post,
  loadedRoot?: Post | null,
): Promise<Post | null> {
  return (await getRouteRootAccessPost(post, loadedRoot)) ? post : null
}
