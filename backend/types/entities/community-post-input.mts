import type { CreatePostInput } from './post.mts'
import type { TopicRecommendationInputFields } from './topic-recommendation-input.mts'

export type CreateCommunityPostInput = Omit<
  CreatePostInput,
  keyof TopicRecommendationInputFields | 'story_id' | 'rss_feed_item_id'
>
