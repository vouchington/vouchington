import type { CommunityPostReview } from '@services/communities/types'
import { getOrCreateCrawlerForHostname } from '@services/crawlers'
import { invalidate } from '@services/entity-cache'
import { applyPostCommitSideEffects } from '../create/post-commit-side-effects.mts'
import type { PostCategoryFinalization } from '../post-category-finalizations.mts'
import type { CreatePostInput, Post } from '../types.mts'
import type { PrivateUser } from '@services/users/types'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import onError from '@modules/on-error'

type FinalizePreparedPostInput = {
  communityReviews: CommunityPostReview[]
  creator: PrivateUser
  isAdminCreator: boolean
  post: Post
  postCategoryFinalization: PostCategoryFinalization
  postType: NonNullable<CreatePostInput['post_type']>
  resolvedUrlHostnameId: string | undefined
  resolvedUrlStrings: string[]
  updates: CreatePostInput
}

export async function finalizePreparedPost(
  input: FinalizePreparedPostInput,
): Promise<{ post: Post; communityReviews: CommunityPostReview[] }> {
  const {
    communityReviews,
    creator,
    isAdminCreator,
    post,
    postCategoryFinalization,
    postType,
    resolvedUrlHostnameId,
    resolvedUrlStrings,
    updates,
  } = input
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
  const postRelatedTopics = await applyPostCommitSideEffects({
    communityReviews,
    creator,
    isAdminCreator,
    post,
    postCategoryFinalization,
    postType,
    updates,
  })
  return {
    post:
      postRelatedTopics === undefined ? post : { ...post, post_related_topics: postRelatedTopics },
    communityReviews,
  }
}
