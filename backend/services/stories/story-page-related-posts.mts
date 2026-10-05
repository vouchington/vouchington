import type { PrivateUser } from '@services/users/types'
import { indexById } from '@modules/utils'
import { getPostByAnyCachedBatch, getPostMetricsByAnyCachedBatch } from '@services/entity-fetch'
import { getPostIdsByUrlIds } from '@services/posts/search/get-posts-by-url-ids'
import { labelAndMaskPosts } from '@services/content-provenance'
import { getVisiblePostStoryIdsByStoryIds } from './get-post-stories.mts'

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
    getPostByAnyCachedBatch(postIds),
    getPostMetricsByAnyCachedBatch(postIds),
  ])
  return {
    related_posts_by_url_id,
    story_post_ids,
    posts: indexById(await labelAndMaskPosts(posts, currentUser)),
    posts_metrics: indexById(metrics),
  }
}
