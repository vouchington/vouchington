import createPostTool from '../create-post.mts'
import updatePostTool from '../update-post.mts'
import deletePostTool from '../delete-post.mts'
import createTopicRecommendationTool from '../create-topic-recommendation.mts'

export const postWriteTools = [
  createPostTool,
  updatePostTool,
  deletePostTool,
  createTopicRecommendationTool,
]
