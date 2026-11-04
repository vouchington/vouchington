import { isModerationStaff } from '@services/users/authorization'
import type { PrivateUser } from '@services/users/types'
import type { CommentPlaceholderState, Post } from './types.mts'

type StateSubject = Pick<Post, 'deleted_at' | 'approved_at' | 'created_by_id'>

/**
 * The state code of a comment for a viewer, or null for a valid reply. Everything else that gates
 * a comment belongs to its thread root, so a comment under a readable root is valid or one of
 * these. It mirrors `buildCommentIsValidSql` in `@services/comments`, which the walk uses, and a
 * test holds the two together. Authors and moderation staff still see an uncleared comment.
 */
export function getCommentPlaceholderState(
  post: StateSubject,
  viewer: PrivateUser | null | undefined,
): CommentPlaceholderState | null {
  if (post.deleted_at) return 'deleted'
  if (isModerationStaff(viewer ?? null)) return null
  if (post.approved_at) return null
  return viewer && post.created_by_id === viewer.id ? null : 'unmoderated'
}

/**
 * A comment the viewer cannot read, reduced to its place in the thread: no text, no author, no
 * moderation outcome, plus the state code clients render a label from. It is never display text.
 */
function toCommentPlaceholder<T extends Post>(post: T, state: CommentPlaceholderState): T {
  return {
    __entity_type: 'post',
    id: post.id,
    slug: null,
    post_type: post.post_type,
    title: '',
    markdown: '',
    ai_summary_markdown: '',
    parent_post_id: post.parent_post_id ?? null,
    root_post_id: post.root_post_id,
    created_by_id: null,
    created_by: null,
    updated_by: null,
    created_at: post.created_at,
    updated_at: post.updated_at,
    updated_by_id: null,
    deleted_at: post.deleted_at,
    deleted_by_id: null,
    archived_at: null,
    archived_by_id: null,
    approved_at: post.approved_at,
    rejected_at: null,
    in_review_at: null,
    locked_at: post.locked_at,
    locked_by_id: null,
    broadcast: post.broadcast,
    privacy: post.privacy,
    is_anonymous: false,
    community_id: post.community_id,
    clearance_status: 'pending',
    clearance_reason: null,
    clearance_updated_at: null,
    placeholder_state: state,
  } as T
}

/** Replaces each comment the viewer cannot read with its placeholder. Other posts pass through. */
export function maskCommentPlaceholders<T extends Post>(
  posts: Array<T | null | undefined>,
  viewer: PrivateUser | null | undefined,
): Array<T | null | undefined> {
  return posts.map(post => {
    if (!post || post.post_type !== 'comment') return post
    const state = getCommentPlaceholderState(post, viewer)
    return state ? toCommentPlaceholder(post, state) : post
  })
}
