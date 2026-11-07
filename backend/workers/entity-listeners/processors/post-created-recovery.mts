import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { requestCommunityModerationRunForPost } from '@services/communities/publications/moderation-run'
import { getOrCreateCrawlersForHostnames } from '@services/crawlers'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { invalidate } from '@services/entity-cache/invalidate'
import {
  getPostRecoverySourceUrlIds,
  getPostRelatedUrlIds,
} from '@services/posts/create/source-url-relation'
import { invalidateStories } from '@services/stories/cache-invalidation'
import { getPostStoryByPostId } from '@services/stories/get-post-stories'
import { getUrlsByIdBatch } from '@services/urls/get-batch'
import { normalizeKey } from '@ts-shared/utils/strings'
import { enqueueStoryPostAgent } from '@queues/ai-agents/enqueues/story-post'
import { hasPostCreationModerationBypass } from '@services/posts/create/moderation-bypass'

type CreatedPost = {
  id: string
  slug?: string | null
  post_type: string
  url_id?: string | null
}

/** Rebuilds creation-only effects entirely from durable post, URL, review, and story rows. */
export async function recoverPostCreatedEffects(post: CreatedPost): Promise<void> {
  const bloomKeys = [normalizeKey(post.id)]
  if (post.slug) bloomKeys.push(normalizeKey(post.slug))
  void entityCacheBloomFilters.posts.add(bloomKeys)

  await Promise.all([
    recoverPostUrlEffects(post),
    recoverApprovedCommunityModeration(post.id),
    recoverStoryEffects(post),
  ])
}

async function recoverPostUrlEffects(post: CreatedPost): Promise<void> {
  const urlIds = await getPostRecoveryUrlIds(post)
  if (urlIds.length === 0) return
  const found = (await getUrlsByIdBatch(urlIds, { readOnly: false })).filter(url => url != null)
  if (found.length === 0) return
  await invalidate.urls(...found.map(url => url.url))
  const crawlable = found.filter(url => !url.hostname.is_blocked && url.hostname.is_crawlable)
  if (crawlable.length === 0) return
  await getOrCreateCrawlersForHostnames(
    null,
    crawlable.map(url => url.hostname.id),
  )
  await enqueueBulkCrawlUrls(crawlable.map(url => ({ urlId: url.id })))
}

async function getPostRecoveryUrlIds(post: CreatedPost): Promise<string[]> {
  const sourceUrlIds = await getPostRecoverySourceUrlIds(post.id, { readOnly: false })
  const storyUrlIds =
    post.post_type === 'story' ? await getPostRelatedUrlIds(post.id, { readOnly: false }) : []
  const canonicalUrlIds = post.post_type === 'link' && post.url_id ? [post.url_id] : []
  return [...new Set([...canonicalUrlIds, ...sourceUrlIds, ...storyUrlIds])]
}

/** Re-requests the C8 run for a published post; idempotent per content digest. */
async function recoverApprovedCommunityModeration(postId: string): Promise<void> {
  if (await hasPostCreationModerationBypass(postId)) return
  await requestCommunityModerationRunForPost(postId)
}

async function recoverStoryEffects(post: CreatedPost): Promise<void> {
  if (post.post_type !== 'story') return
  const postStory = await getPostStoryByPostId(post.id, { readOnly: false })
  if (!postStory) return
  await invalidateStories(postStory.story_id)
  await enqueueStoryPostAgent(post.id)
}
