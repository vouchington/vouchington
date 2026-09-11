import onError from '@modules/on-error'
import type { Post } from '@services/posts/types'

export function makeModerationDeduplicationKey(post: Post, contentSha256: Buffer): string {
  // resetPostClearance must not touch updated_at; this key depends on one edit version.
  /* v8 ignore start -- getPostByAny hydrates updated_at as Date; fallback reports schema drift */
  if (!(post.updated_at instanceof Date)) {
    onError(new Error(`makeModerationDeduplicationKey: post ${post.id} missing updated_at`))
    return `${contentSha256.toString('hex')}_${Date.now()}`
  }
  /* v8 ignore stop */
  return `${contentSha256.toString('hex')}_${post.updated_at.getTime()}`
}
