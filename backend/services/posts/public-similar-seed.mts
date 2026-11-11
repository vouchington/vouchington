import { isSlug, isUUID } from '@modules/utils'
import { BLOCKED_POST_TYPES } from '@voucha/types/entities/post'
import { getRequestedPostReadState } from './comment-read-state.mts'
import { getPostsOrDeletedCommentStubs } from './deleted-comment-stubs.mts'
import { getPostsByAnyBatch } from './get-batch.mts'

/**
 * A similar-post seed is usable only when a signed-out reader can read it. Private visibility,
 * pending clearance, and blocked types answer as a missing seed so their embedding ranks nothing.
 */
async function isPubliclyReadableSimilarSeed(idOrSlug: string): Promise<boolean> {
  if (!isUUID(idOrSlug) && !isSlug(idOrSlug)) return false
  const [post] = await getPostsOrDeletedCommentStubs([idOrSlug])
  // An anonymous seed must be cleared; a pending comment can only be a placeholder.
  if (!post || !post.approved_at || BLOCKED_POST_TYPES.has(post.post_type)) return false
  const [loadedRoot] = post.root_post_id ? await getPostsByAnyBatch([post.root_post_id]) : [null]
  const root = loadedRoot ?? null
  if (post.root_post_id && (!root || BLOCKED_POST_TYPES.has(root.post_type))) return false
  const accessPost = root ?? post
  // Deny known negatives before the authorization read. Comments inherit the root's audience.
  // Positive candidates still need the community, story-source and comment-state checks below.
  if (!accessPost.approved_at || accessPost.privacy !== 'public') return false
  return (await getRequestedPostReadState(null, post, root)) === 'readable'
}

/** MCP similar search needs a caller. A missing caller answers as an empty page. */
export function rejectMcpSimilarSeed(
  hasCaller: boolean,
  similarPostId: string | undefined,
): Promise<boolean> {
  return similarSeedRejected(similarPostId, { requireCaller: true, hasCaller })
}

/** REST anonymous search uses the public-seed check alone. */
export async function similarSeedRejected(
  similarPostId: string | undefined,
  options: { requireCaller: boolean; hasCaller: boolean },
): Promise<boolean> {
  if (!similarPostId) return false
  if (options.requireCaller && !options.hasCaller) return true
  return !(await isPubliclyReadableSimilarSeed(similarPostId))
}
