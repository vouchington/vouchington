import type { PrivateUser } from '@services/users/types'
import { indexById } from '@modules/utils'
import { getPostByAnyCachedBatch, getPostMetricsByAnyCachedBatch } from '@services/entity-fetch'
import { getPostIdsByUrlIds } from '@services/posts/search/get-posts-by-url-ids'
import { labelAndMaskPosts } from '@services/content-provenance'
import { getVisiblePostStoryIdsByStoryIds } from './get-post-stories.mts'
import { getAnonymousPostRowsByIdsCached } from '@services/posts/anonymous-snapshot'

export async function getStoryPageRelatedPosts(
  currentUser: PrivateUser | null,
  storyId: string,
  urlIds: string[],
) {
  const [related_posts_by_url_id, story_post_ids] = await Promise.all([
    getPostIdsByUrlIds(currentUser, urlIds),
    getVisiblePostStoryIdsByStoryIds(currentUser, [storyId]),
  ])
  const postIds = [
    ...new Set([
      ...Object.values(related_posts_by_url_id).flat(),
      ...Object.values(story_post_ids),
    ]),
  ]
  const [posts, metrics] = await Promise.all([
    currentUser
      ? getPostByAnyCachedBatch(postIds)
      : getAnonymousPostRowsByIdsCached(postIds, 'discovery').then(rows =>
          rows.map(row => row.post),
        ),
    getPostMetricsByAnyCachedBatch(postIds),
  ])
  const visiblePostIds = new Set(posts.flatMap(post => (post ? [post.id] : [])))
  return {
    related_posts_by_url_id: currentUser
      ? related_posts_by_url_id
      : Object.fromEntries(
          Object.entries(related_posts_by_url_id).map(([urlId, ids]) => [
            urlId,
            ids.filter(id => visiblePostIds.has(id)),
          ]),
        ),
    story_post_ids: currentUser
      ? story_post_ids
      : Object.fromEntries(
          Object.entries(story_post_ids).filter(([, postId]) => visiblePostIds.has(postId)),
        ),
    posts: indexById(await labelAndMaskPosts(posts, currentUser)),
    posts_metrics: indexById(
      currentUser ? metrics : metrics.filter(metric => metric && visiblePostIds.has(metric.id)),
    ),
  }
}
