import type { PrivateUser } from '@services/users/types'
import type { Post } from './types.mts'

type MaskablePost = Post & {
  created_by?: unknown | null
  updated_by?: unknown | null
}

export function maskAnonymousPost<T extends MaskablePost>(
  post: T | null | undefined,
  currentUser?: PrivateUser | null,
): T | null | undefined {
  if (!post || !post.is_anonymous) return post
  if (currentUser?.roles.includes('administrator')) return post
  if (currentUser?.id === post.created_by_id) return post

  const masked = {
    ...post,
    created_by_id: null,
    updated_by_id: null,
    locked_by_id: null,
  } as T
  if ('created_by' in post) {
    ;(masked as T & { created_by?: unknown | null }).created_by = null
  }
  if ('updated_by' in post) {
    ;(masked as T & { updated_by?: unknown | null }).updated_by = null
  }
  return masked
}

export function maskAnonymousPosts<T extends MaskablePost>(
  posts: Array<T | null | undefined>,
  currentUser?: PrivateUser | null,
): Array<T | null | undefined> {
  return posts.map(post => maskAnonymousPost(post, currentUser))
}
