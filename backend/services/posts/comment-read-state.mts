import { commentPlaceholderHasValidReply } from '@services/comments/placeholder-state'
import type { PrivateUser } from '@services/users/types'
import { canViewPost } from './check-privacy-access.mts'
import { getCommentPlaceholderState } from './comment-placeholder.mts'
import type { Post } from './types.mts'

/**
 * How a requested comment reads: as itself, as a placeholder, or not at all. A reply is readable
 * when it and its thread root pass. A deleted or unmoderated comment answers as a placeholder only
 * when a valid reply sits below it within the look-down limits, and as not found otherwise.
 *
 * `root` is the thread root, or null when `post` is the root. A caller that has to treat a
 * non-comment post the same way passes it through: it is readable or not.
 */
export async function getRequestedPostReadState(
  viewer: PrivateUser | null,
  post: Post,
  root: Post | null,
): Promise<'readable' | 'placeholder' | null> {
  if (post.post_type !== 'comment') {
    return post.deleted_at || !(await canViewPost(viewer, post)) ? null : 'readable'
  }
  if (!root || !(await canViewPost(viewer, root))) return null
  return getCommentReadStateUnderReadableRoot(viewer, post, root.id)
}

/**
 * How a comment reads once the caller has already passed `canViewPost` on its thread root, so a
 * route that checks the root itself does not repeat that read.
 */
export async function getCommentReadStateUnderReadableRoot(
  viewer: PrivateUser | null,
  comment: Post,
  rootId: string,
): Promise<'readable' | 'placeholder' | null> {
  if (!getCommentPlaceholderState(comment, viewer)) return 'readable'
  return (await commentPlaceholderHasValidReply(viewer, rootId, comment.id)) ? 'placeholder' : null
}
