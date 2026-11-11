import { getPostByAnyCached } from './get-cached.mts'
import type { Post } from './types.mts'
import { getDeletedCommentStubs } from './deleted-comment-stubs.mts'
import { getPostsWithRootsByAnyCached } from './get-cached-with-roots.mts'

/**
 * The post a route acts on and its thread root. A deleted comment answers as absent unless the
 * caller reads it as a placeholder (`includeDeleted`), in which case it comes back as its stub.
 */
export async function getRoutePostByAnyCached(
  identifier: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
) {
  const {
    posts: [loaded],
    roots,
  } = await getPostsWithRootsByAnyCached([identifier])
  if (loaded || !includeDeleted) {
    return {
      post: loaded ?? null,
      root: roots.find(root => root?.id === loaded?.root_post_id) ?? null,
    }
  }
  const stub = (await getDeletedCommentStubs([identifier])).get(identifier.toLowerCase()) ?? null
  const root = stub?.root_post_id ? await getPostByAnyCached(stub.root_post_id) : null
  return { post: stub, root }
}

export function getRouteRootAccessPost(post: Post, loadedRoot?: Post | null): Promise<Post | null> {
  if (!post.root_post_id) return Promise.resolve(post)

  const root =
    loadedRoot === undefined ? getPostByAnyCached(post.root_post_id) : Promise.resolve(loadedRoot)
  return root.then(rootPost => {
    if (!rootPost) return null
    return rootPost
  })
}

export async function getRouteAccessPost(
  post: Post,
  loadedRoot?: Post | null,
): Promise<Post | null> {
  return (await getRouteRootAccessPost(post, loadedRoot)) ? post : null
}
