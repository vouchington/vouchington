import { createPaginationParser } from '@modules/pagination'
import { getPostByAnyCached } from '@services/entity-fetch'
import type { Post } from '@services/posts/types'

export const topicRecommendationsParser = createPaginationParser({
  cursor: { type: 'score', paramName: 'after' },
  limit: { min: 1, max: 100, default: 25 },
})

type TopicRecommendationPost = Post & {
  post_type: 'topic_recommendation'
  topic_recommendation: NonNullable<Post['topic_recommendation']>
}

export function assertTopicRecommendationPost(
  post: Awaited<ReturnType<typeof getPostByAnyCached>>,
): TopicRecommendationPost | null {
  return isTopicRecommendationPost(post) ? post : null
}

function isTopicRecommendationPost(
  post: Awaited<ReturnType<typeof getPostByAnyCached>>,
): post is TopicRecommendationPost {
  return post?.post_type === 'topic_recommendation' && post.topic_recommendation != null
}
