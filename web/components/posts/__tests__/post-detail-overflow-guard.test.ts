import { describe, expect, it } from 'vitest'
import type { Post } from '@/types/posts'
import { getPostOverflowVisibility, hasPostOverflowActions } from '../post-detail-overflow-guard'

const BASE_POST: Post = {
  id: 'post-1',
  slug: null,
  post_type: 'discussion',
  privacy: 'public',
  broadcast: 'everyone',
  created_by_id: 'author-1',
  created_by: null,
  is_anonymous: false,
  community_id: null,
  community: null,
  can_edit_content: false,
  can_delete: false,
  can_lock: false,
  can_unpublish_from_community: false,
  // fill remaining required Post fields with nulls / defaults as needed
} as unknown as Post

const AUTH_CONTEXT = {
  isAuthenticated: true,
  isOwner: false,
  isAdmin: false,
  currentUserId: 'viewer-1',
}

describe('getPostOverflowVisibility', () => {
  it('returns all false when unauthenticated', () => {
    const v = getPostOverflowVisibility(BASE_POST, { ...AUTH_CONTEXT, isAuthenticated: false })
    expect(v).toEqual({
      canShare: false,
      canReport: false,
      canEdit: false,
      canDelete: false,
      canLock: false,
      canUnpublish: false,
    })
  })

  it('canShare: true when post is public broadcast=everyone and viewer is not author', () => {
    const post = {
      ...BASE_POST,
      privacy: 'public',
      broadcast: 'everyone',
      created_by_id: 'author-1',
    } as unknown as Post
    const v = getPostOverflowVisibility(post, { ...AUTH_CONTEXT, currentUserId: 'viewer-1' })
    expect(v.canShare).toBe(true)
  })

  it('canShare: false when viewer is the author', () => {
    const post = {
      ...BASE_POST,
      privacy: 'public',
      broadcast: 'everyone',
      created_by_id: 'author-1',
    } as unknown as Post
    const v = getPostOverflowVisibility(post, { ...AUTH_CONTEXT, currentUserId: 'author-1' })
    expect(v.canShare).toBe(false)
  })

  it('canShare: false when currentUserId is null', () => {
    const post = {
      ...BASE_POST,
      privacy: 'public',
      broadcast: 'everyone',
      created_by_id: 'author-1',
    } as unknown as Post
    const v = getPostOverflowVisibility(post, { ...AUTH_CONTEXT, currentUserId: null })
    expect(v.canShare).toBe(false)
  })

  it('canShare: true when post.created_by_id is null (author-less public post)', () => {
    const post = {
      ...BASE_POST,
      privacy: 'public',
      broadcast: 'everyone',
      created_by_id: null,
    } as unknown as Post
    const v = getPostOverflowVisibility(post, { ...AUTH_CONTEXT, currentUserId: 'viewer-1' })
    expect(v.canShare).toBe(true)
  })

  it('canReport: true when viewer is not the author', () => {
    const post = { ...BASE_POST, created_by_id: 'author-1' } as unknown as Post
    const v = getPostOverflowVisibility(post, { ...AUTH_CONTEXT, currentUserId: 'viewer-1' })
    expect(v.canReport).toBe(true)
  })

  it('canReport: false when viewer is the author', () => {
    const post = { ...BASE_POST, created_by_id: 'author-1' } as unknown as Post
    const v = getPostOverflowVisibility(post, { ...AUTH_CONTEXT, currentUserId: 'author-1' })
    expect(v.canReport).toBe(false)
  })

  it('canReport: false when post.created_by_id is null', () => {
    const post = { ...BASE_POST, created_by_id: null } as unknown as Post
    const v = getPostOverflowVisibility(post, { ...AUTH_CONTEXT, currentUserId: 'viewer-1' })
    expect(v.canReport).toBe(false)
  })

  it('canEdit: true for admin on editable post type', () => {
    const post = { ...BASE_POST, post_type: 'review' } as unknown as Post
    const v = getPostOverflowVisibility(post, { ...AUTH_CONTEXT, isAdmin: true })
    expect(v.canEdit).toBe(true)
  })

  it('canEdit: true for owner with can_edit_content', () => {
    const post = { ...BASE_POST, post_type: 'article', can_edit_content: true } as unknown as Post
    const v = getPostOverflowVisibility(post, { ...AUTH_CONTEXT, isOwner: true })
    expect(v.canEdit).toBe(true)
  })

  it('canEdit: false for non-editable post type', () => {
    const post = { ...BASE_POST, post_type: 'comment' } as unknown as Post
    const v = getPostOverflowVisibility(post, { ...AUTH_CONTEXT, isAdmin: true })
    expect(v.canEdit).toBe(false)
  })

  it('canDelete: reflects post.can_delete', () => {
    const post = { ...BASE_POST, can_delete: true } as unknown as Post
    expect(getPostOverflowVisibility(post, AUTH_CONTEXT).canDelete).toBe(true)
    expect(getPostOverflowVisibility(BASE_POST, AUTH_CONTEXT).canDelete).toBe(false)
  })

  it('canLock: reflects post.can_lock', () => {
    const post = { ...BASE_POST, can_lock: true } as unknown as Post
    expect(getPostOverflowVisibility(post, AUTH_CONTEXT).canLock).toBe(true)
    expect(getPostOverflowVisibility(BASE_POST, AUTH_CONTEXT).canLock).toBe(false)
  })

  it('canUnpublish: true when can_unpublish_from_community and community_id is set', () => {
    const post = {
      ...BASE_POST,
      can_unpublish_from_community: true,
      community_id: 'comm-1',
    } as unknown as Post
    expect(getPostOverflowVisibility(post, AUTH_CONTEXT).canUnpublish).toBe(true)
  })

  it('canUnpublish: false when community_id is null', () => {
    const post = {
      ...BASE_POST,
      can_unpublish_from_community: true,
      community_id: null,
    } as unknown as Post
    expect(getPostOverflowVisibility(post, AUTH_CONTEXT).canUnpublish).toBe(false)
  })
})

describe('hasPostOverflowActions', () => {
  it('returns false when all flags are false', () => {
    expect(hasPostOverflowActions(BASE_POST, { ...AUTH_CONTEXT, isAuthenticated: false })).toBe(
      false,
    )
  })

  it('returns true when any flag is true', () => {
    const post = { ...BASE_POST, can_delete: true } as unknown as Post
    expect(hasPostOverflowActions(post, AUTH_CONTEXT)).toBe(true)
  })
})
