import type { Post } from './types.mts'

/** The public post fields shared by read_posts and recommendation mutation responses. */
export const PUBLIC_POST_FIELDS = [
  'id',
  'slug',
  'post_type',
  'title',
  'markdown',
  'parent_post_id',
  'root_post_id',
  'created_by_id',
  'is_anonymous',
  'created_at',
  'updated_at',
  'provenance',
  'placeholder_state',
] as const

export type PublicPost = {
  id: string
  slug: string | null
  post_type: Post['post_type']
  title: string
  markdown: string
  parent_post_id: string | null
  root_post_id: string | null
  created_by_id: string | null
  is_anonymous: boolean
  created_at: string
  updated_at: string
  provenance?: Post['provenance']
  placeholder_state?: Post['placeholder_state']
}

/** Project an already labelled post without retaining other database or moderation fields. */
export function projectPublicPost(post: Post): PublicPost {
  return {
    id: post.id,
    slug: post.slug ?? null,
    post_type: post.post_type,
    title: post.title,
    markdown: post.markdown,
    parent_post_id: post.parent_post_id ?? null,
    root_post_id: post.root_post_id ?? null,
    created_by_id: post.is_anonymous ? null : (post.created_by_id ?? null),
    is_anonymous: post.is_anonymous,
    created_at: new Date(post.created_at).toISOString(),
    updated_at: new Date(post.updated_at).toISOString(),
    ...(post.provenance && { provenance: post.provenance }),
    ...(post.placeholder_state && { placeholder_state: post.placeholder_state }),
  }
}
