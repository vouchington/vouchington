import createPostTool from '../create-post.mts'
import actOnPostTool from '../act-on-post.mts'
import deletePostTool from '../delete-post.mts'
import createTopicRecommendationTool from '../create-topic-recommendation.mts'

export const postWriteTools = [
  createPostTool,
  actOnPostTool,
  deletePostTool,
  createTopicRecommendationTool,
]
