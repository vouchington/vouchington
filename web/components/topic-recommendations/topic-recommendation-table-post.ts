import type { Post } from '@/types/posts'
import type { TopicRecommendationEditablePost } from './topic-recommendation-editable-state'

export type TopicRecommendationTablePost = TopicRecommendationEditablePost &
  Pick<Post, 'id' | 'updated_at' | 'created_at' | 'created_by' | 'created_by_id'>
