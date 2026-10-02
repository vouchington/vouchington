import type { ClassifierSafeText } from '@agents/classifiers/safe-content'
import type { ClassifierRunLease } from '@services/classifier-runs'
import { createPostModerationContent } from '@services/posts/content'
import { getPostByAny } from '@services/posts/get'
import { createRssFeedItemEmbeddingContent } from '@services/rss-feed-items/content'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { buildPostClassifierState, buildRssFeedItemClassifierState } from './content.mts'

export type SubjectState = () => Promise<ClassifierSafeText>

/**
 * The subject at the content the receipt is keyed on, as a lazy sanitized classifier state; null
 * when the subject is gone or has moved on to other content. Both autotagger stages read the same
 * state, so the first stage's tags and the reasoning pass's questions are asked about one text.
 */
export async function loadSubjectState(
  lease: Pick<ClassifierRunLease<unknown>, 'subject' | 'inputSha256'>,
): Promise<SubjectState | null> {
  const { postId, rssFeedItemId } = lease.subject
  if (postId !== null) {
    const post = await getPostByAny(postId, { readOnly: false })
    if (!post) return null
    if (!createPostModerationContent(post).content_sha256.equals(lease.inputSha256)) return null
    return () => buildPostClassifierState(post)
  }
  const item = await getRssFeedItemById(rssFeedItemId, { readOnly: false })
  if (!item) return null
  if (!createRssFeedItemEmbeddingContent(item.data).content_sha256.equals(lease.inputSha256)) {
    return null
  }
  return () => buildRssFeedItemClassifierState(item)
}
