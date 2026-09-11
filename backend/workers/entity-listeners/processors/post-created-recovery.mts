import { enqueueBulkCommunityModerationDispatchersAwaited } from '@queues/ai-agents/enqueues/community-moderation'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { getApprovedReviewsForPost } from '@services/communities/publications/get'
import { getOrCreateCrawlerForHostname } from '@services/crawlers'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { invalidate } from '@services/entity-cache/invalidate'
import {
  getPostRecoverySourceUrlIds,
  getPostRelatedUrlIds,
} from '@services/posts/create/source-url-relation'
import { invalidateStories } from '@services/stories/cache-invalidation'
import { getPostStoryByPostId } from '@services/stories/get-post-stories'
import { getUrlById } from '@services/urls/get'
import { normalizeKey } from '@ts-shared/utils/strings'
import { enqueueStoryPostAgent } from '@queues/ai-agents/enqueues/story-post'
import { hasPostCreationModerationBypass } from '@services/posts/create/moderation-bypass'

type CreatedPost = {
  id: string
  slug?: string | null
  post_type: string
  url_id?: string | null
}

type RecoveryDependencies = {
  enqueueCommunityModerationDispatchers?: typeof enqueueBulkCommunityModerationDispatchersAwaited
  enqueueStoryPostAgent?: typeof enqueueStoryPostAgent
}

/** Rebuilds creation-only effects entirely from durable post, URL, review, and story rows. */
export async function recoverPostCreatedEffects(
  post: CreatedPost,
  dependencies: RecoveryDependencies = {},
): Promise<void> {
  const bloomKeys = [normalizeKey(post.id)]
  if (post.slug) bloomKeys.push(normalizeKey(post.slug))
  entityCacheBloomFilters.posts.add(bloomKeys)

  await Promise.all([
    recoverPostUrlEffects(post),
    recoverApprovedCommunityModeration(
      post.id,
      dependencies.enqueueCommunityModerationDispatchers ??
        enqueueBulkCommunityModerationDispatchersAwaited,
    ),
    recoverStoryEffects(post, dependencies.enqueueStoryPostAgent ?? enqueueStoryPostAgent),
  ])
}

async function recoverPostUrlEffects(post: CreatedPost): Promise<void> {
  const urlIds = await getPostRecoveryUrlIds(post)
  await Promise.all(urlIds.map(recoverUrlEffect))
}

async function recoverUrlEffect(urlId: string): Promise<void> {
  const url = await getUrlById(urlId, { readOnly: false })
  if (!url) return
  await invalidate.urls(url.url)
  if (url.hostname.blocked || url.hostname.crawlable === false) return
  await getOrCreateCrawlerForHostname(null, url.hostname.id)
  await enqueueBulkCrawlUrls([{ urlId }])
}

async function getPostRecoveryUrlIds(post: CreatedPost): Promise<string[]> {
  const sourceUrlIds = await getPostRecoverySourceUrlIds(post.id, { readOnly: false })
  const storyUrlIds =
    post.post_type === 'story' ? await getPostRelatedUrlIds(post.id, { readOnly: false }) : []
  const canonicalUrlIds = post.post_type === 'link' && post.url_id ? [post.url_id] : []
  return [...new Set([...canonicalUrlIds, ...sourceUrlIds, ...storyUrlIds])]
}

async function recoverApprovedCommunityModeration(
  postId: string,
  enqueueCommunityModerationDispatchers: typeof enqueueBulkCommunityModerationDispatchersAwaited,
): Promise<void> {
  if (await hasPostCreationModerationBypass(postId)) return
  const communityIds = await getApprovedReviewsForPost(postId, { readOnly: false })
  if (communityIds.length === 0) return
  await enqueueCommunityModerationDispatchers(
    communityIds.map(communityId => ({ postId, communityId })),
  )
}

async function recoverStoryEffects(
  post: CreatedPost,
  enqueueStoryPost: typeof enqueueStoryPostAgent,
): Promise<void> {
  if (post.post_type !== 'story') return
  const postStory = await getPostStoryByPostId(post.id, { readOnly: false })
  if (!postStory) return
  await invalidateStories(postStory.story_id)
  await enqueueStoryPost(post.id)
}
