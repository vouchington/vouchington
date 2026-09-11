import type { Post } from '@/types/posts'

export function canSharePost(post: Post): boolean {
  if (post.post_type === 'comment' || post.privacy !== 'public') return false
  return post.broadcast === 'everyone' || post.broadcast === 'users'
}
