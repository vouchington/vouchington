import createHttpError from 'http-errors'
import { getPostByAnyCached } from '@services/entity-fetch'
import { postReferenceSchema } from './entity-reference-schema.mts'
import { asTopicRecommendationPost } from '@services/topic-recommendations'
import { componentSchema } from './route-response-schema.mts'
import { successSchema } from '@vouchington/mcp-server/schema'

export type TopicRecommendationIdArgs = { id: string }

export const TOPIC_RECOMMENDATION_ID_SCHEMA = postReferenceSchema

/**
 * The recommendation the REST routes load for `:id`. A post that is missing or is not a topic
 * recommendation is "not found". Who may edit or withdraw it stays in the shared service commands.
 */
export async function loadTopicRecommendation(id: string) {
  const recommendation = asTopicRecommendationPost(await getPostByAnyCached(id))
  if (!recommendation) throw createHttpError(404, 'Recommendation not found')
  return recommendation
}

/**
 * The explicit REST mutation response post: read_posts' public base plus the required workflow
 * extension. A contract test pins its base properties to read_posts.
 */
export const TOPIC_RECOMMENDATION_POST_SCHEMA = componentSchema('PublicTopicRecommendationPost')

export const TOPIC_RECOMMENDATION_RESULT_SCHEMA = successSchema({
  post: TOPIC_RECOMMENDATION_POST_SCHEMA,
})
export const TOPIC_RECOMMENDATION_SUCCESS_SCHEMA = successSchema({})
