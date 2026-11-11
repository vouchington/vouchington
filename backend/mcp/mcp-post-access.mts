import { isSlug, isUUID } from '@modules/utils'
import { getPostByAnyCached, getPostByAnyCachedBatch } from '@services/entity-fetch'
import {
  getCommentPlaceholderState,
  getPostsOrDeletedCommentStubs,
  getRequestedPostReadState,
  type Post,
} from '@services/posts'
import { canViewPostsBatch } from '@services/posts/check-privacy-access'
import { BLOCKED_POST_TYPES } from '@voucha/types/entities/post'
import type { BasicUser, PrivateUser } from '@services/users/types'
import { requirePrivateToolUser } from './private-user.mts'

type ReadableThread = {
  viewer?: PrivateUser
  /** The requested post. */
  post: Post
  /** Its thread root, which is `post` itself for a root post. */
  root: Post
  /** `placeholder` when `post` is a deleted or unmoderated comment with a valid reply below it. */
  state: 'readable' | 'placeholder'
}

/**
 * Resolves the post an MCP caller may read, or null when it answers as not found.
 *
 * Uses the same authenticated viewer and shared direct-read policy as REST, including
 * creator access to pending/private posts. Anonymous author fields remain masked by projection.
 *
 * A deleted or unmoderated requested comment is a `placeholder` when a valid reply sits below it
 * within the look-down limits, and not found otherwise, as in the REST twin.
 *
 * `read_posts (option search)` follows the REST discovery query and masks returned comments using
 * the same viewer-aware placeholder rules as the REST response.
 */
export async function resolveReadableThread(
  currentUser: BasicUser,
  idOrSlug: string,
): Promise<ReadableThread | null> {
  if (!isUUID(idOrSlug) && !isSlug(idOrSlug)) return null
  const [post] = await getPostsOrDeletedCommentStubs([idOrSlug])
  if (!post) return null
  const root = post.root_post_id ? await getPostByAnyCached(post.root_post_id) : post
  if (!root) return null

  const viewer = await requirePrivateToolUser(currentUser)
  const state = await getRequestedPostReadState(viewer, post, post.root_post_id ? root : null)
  return state ? { post, root, state, viewer } : null
}

/**
 * Resolves public list-item posts in `postIds` order; placeholders answer null rather than
 * returning a stand-in. Authenticated by-id reads use `resolveReadableThread`. A page runs one cached post read, one cached root read, one `requirePrivateToolUser`
 * and one `canViewPostsBatch`, however many posts it holds. Takes post ids only; an entry that is
 * not a UUID is not found.
 */
export async function resolveReadableThreads(
  currentUser: BasicUser,
  postIds: string[],
): Promise<(ReadableThread | null)[]> {
  const ids = [...new Set(postIds.filter(isUUID))]
  const posts = (await getPostByAnyCachedBatch(ids)).filter((post): post is Post => Boolean(post))
  const rootIds = [
    ...new Set(posts.flatMap(post => (post.root_post_id ? [post.root_post_id] : []))),
  ]
  const roots = new Map(
    (await getPostByAnyCachedBatch(rootIds)).flatMap(root => (root ? [[root.id, root]] : [])),
  )
  const candidates = posts.flatMap(post => {
    const root = post.root_post_id ? roots.get(post.root_post_id) : post
    if (!root || BLOCKED_POST_TYPES.has(post.post_type) || BLOCKED_POST_TYPES.has(root.post_type)) {
      return []
    }
    if (post.post_type === 'comment' && getCommentPlaceholderState(post, null)) return []
    return [{ post, root }]
  })
  const readable = new Map<string, ReadableThread>()
  if (candidates.length > 0) {
    await requirePrivateToolUser(currentUser)
    const access = [...new Map(candidates.map(({ root }) => [root.id, root])).values()]
    const asSignedOut = await canViewPostsBatch(null, access)
    for (const { post, root } of candidates) {
      if (asSignedOut.get(root.id)) {
        readable.set(post.id, { post, root, state: 'readable' })
      }
    }
  }
  return postIds.map(id => readable.get(id) ?? null)
}
