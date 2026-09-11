import type { Post, PostType } from '@/types/posts'
import { isEditablePostType } from '@/lib/post-editability'

export type PostOverflowViewModel = Pick<
  Post,
  | 'id'
  | 'slug'
  | 'post_type'
  | 'privacy'
  | 'broadcast'
  | 'created_by_id'
  | 'can_edit_content'
  | 'can_delete'
  | 'can_lock'
  | 'can_unpublish_from_community'
  | 'community_id'
  | 'locked_at'
>

function canSharePost(post: {
  post_type: PostType
  privacy?: string
  broadcast?: string
}): boolean {
  if (post.post_type === 'comment' || post.privacy !== 'public') return false
  return post.broadcast === 'everyone' || post.broadcast === 'users'
}

export interface PostOverflowContext {
  isAuthenticated: boolean
  isOwner: boolean
  isAdmin: boolean
  currentUserId: string | null
}

export interface PostOverflowVisibility {
  canShare: boolean
  canReport: boolean
  canEdit: boolean
  canDelete: boolean
  canLock: boolean
  canUnpublish: boolean
}

/**
 * Canonical source of truth for which overflow-menu items are visible for a given post + viewer.
 * Used both to gate rendering the menu trigger (hasPostOverflowActions) and to compute per-item
 * visibility inside PostDetailOverflowMenu — eliminating the risk of the two drifting apart.
 */
export function getPostOverflowVisibility(
  post: PostOverflowViewModel,
  { isAuthenticated, isOwner, isAdmin, currentUserId }: PostOverflowContext,
): PostOverflowVisibility {
  if (!isAuthenticated) {
    return {
      canShare: false,
      canReport: false,
      canEdit: false,
      canDelete: false,
      canLock: false,
      canUnpublish: false,
    }
  }

  return {
    canShare: canSharePost(post) && currentUserId != null && currentUserId !== post.created_by_id,
    canReport:
      currentUserId != null && post.created_by_id != null && currentUserId !== post.created_by_id,
    canEdit:
      isEditablePostType(post.post_type) &&
      (isAdmin || (isOwner && (post.can_edit_content ?? false))),
    canDelete: post.can_delete ?? false,
    canLock: post.can_lock ?? false,
    canUnpublish: (post.can_unpublish_from_community ?? false) && post.community_id != null,
  }
}

export function hasPostOverflowActions(
  post: PostOverflowViewModel,
  context: PostOverflowContext,
): boolean {
  const v = getPostOverflowVisibility(post, context)
  return v.canShare || v.canReport || v.canEdit || v.canDelete || v.canLock || v.canUnpublish
}
