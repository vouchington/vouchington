import { projectPublicPost, type PublicPost } from '@services/posts/public-post-projection'
import type { TopicRecommendationPost } from './types.mts'

export type PublicTopicRecommendationPost = PublicPost & {
  post_type: 'topic_recommendation'
  topic_recommendation: TopicRecommendationPost['topic_recommendation']
}

/** Keep the proposed-topic workflow fields beside the public post projection. */
export function projectPublicTopicRecommendation(
  post: TopicRecommendationPost,
): PublicTopicRecommendationPost {
  return {
    ...projectPublicPost(post),
    post_type: 'topic_recommendation',
    topic_recommendation: post.topic_recommendation,
  }
}
