import type { PostRevisionChanges } from '@services/post-revisions'
import type { Post, UpdatePostChanges } from '../types.mts'

export function getPostLinkRevision(post: Post, changes: UpdatePostChanges): PostRevisionChanges {
  if (changes.url_id !== undefined && changes.url_id !== post.url_id)
    return { url_id: { before: post.url_id ?? null, after: changes.url_id } }
  return {}
}
