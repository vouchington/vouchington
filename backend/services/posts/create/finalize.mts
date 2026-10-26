import type { CommunityPostReview } from '@services/communities/types'
import { getOrCreateCrawlerForHostname } from '@services/crawlers'
import { invalidate } from '@services/entity-cache'
import { applyPostCommitSideEffects } from '../create/post-commit-side-effects.mts'
import type { CreatePostInput, Post } from '../types.mts'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import onError from '@modules/on-error'

type FinalizePreparedPostInput = {
  communityReviews: CommunityPostReview[]
  post: Post
  resolvedUrlHostnameId: string | undefined
  resolvedUrlStrings: string[]
  updates: CreatePostInput
}

export async function finalizePreparedPost(
  input: FinalizePreparedPostInput,
): Promise<{ post: Post; communityReviews: CommunityPostReview[] }> {
  const { communityReviews, post, resolvedUrlHostnameId, resolvedUrlStrings, updates } = input
  if (resolvedUrlStrings.length > 0) {
    await invalidate.urls(...resolvedUrlStrings)
    if (updates.url_id && resolvedUrlHostnameId) {
      const urlId = updates.url_id
      await getOrCreateCrawlerForHostname(null, resolvedUrlHostnameId)
        .then(() => {
          void enqueueBulkCrawlUrls([{ urlId }])
        })
        .catch(onError)
    }
  }
  await applyPostCommitSideEffects({ post })
  return { post, communityReviews }
}
