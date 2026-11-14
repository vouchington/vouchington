import type { PrivateUser } from '@services/users/types'
import { getRssFeedItemByIdCachedBatch } from '@services/entity-fetch'
import { getPostIdsByUrlIds } from '@services/posts/search/get-posts-by-url-ids'
import { getAnonymousPostRowsByIdsCached } from '@services/posts/anonymous-snapshot'

export async function loadNewsRelatedPosts(
  currentUser: PrivateUser | null,
  items: Awaited<ReturnType<typeof getRssFeedItemByIdCachedBatch>>,
  storyPostIds: Record<string, string>,
) {
  const urlIds = [...new Set(items.flatMap(item => (item?.url?.id ? [item.url.id] : [])))]
  const storyPostIdValues = Object.values(storyPostIds)
  if (urlIds.length === 0 && currentUser)
    return {
      related_posts_by_url_id: {},
      story_post_ids: storyPostIds,
      postIds: storyPostIdValues,
      anonymousPosts: null,
    }
  const related_posts_by_url_id = await getPostIdsByUrlIds(currentUser, urlIds)
  const postIds = [
    ...new Set([...Object.values(related_posts_by_url_id).flat(), ...storyPostIdValues]),
  ]
  if (currentUser)
    return { related_posts_by_url_id, story_post_ids: storyPostIds, postIds, anonymousPosts: null }
  const rows = await getAnonymousPostRowsByIdsCached(postIds, 'discovery')
  const anonymousPosts = rows.flatMap(row => (row.post ? [row.post] : []))
  const visibleIds = new Set(anonymousPosts.map(post => post.id))
  return {
    story_post_ids: Object.fromEntries(
      Object.entries(storyPostIds).filter(([, postId]) => visibleIds.has(postId)),
    ),
    related_posts_by_url_id: Object.fromEntries(
      Object.entries(related_posts_by_url_id).map(([urlId, ids]) => [
        urlId,
        ids.filter(id => visibleIds.has(id)),
      ]),
    ),
    postIds: postIds.filter(id => visibleIds.has(id)),
    anonymousPosts,
  }
}
