import type { Post } from '@services/posts/types'
import type { TopicRecommendationPost } from './types.mts'

/**
 * The post as a topic recommendation, or null when it is missing or any other kind of post. The
 * recommendation routes and tools answer null as "Recommendation not found".
 */
export function asTopicRecommendationPost(
  post: Post | null | undefined,
): TopicRecommendationPost | null {
  return post?.post_type === 'topic_recommendation' && post.topic_recommendation != null
    ? (post as TopicRecommendationPost)
    : null
}
