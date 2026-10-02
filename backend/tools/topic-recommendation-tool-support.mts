import createHttpError from 'http-errors'
import { getPostByAnyCached } from '@services/entity-fetch'
import { asTopicRecommendationPost } from '@services/topic-recommendations'
import { componentSchema } from './route-response-schema.mts'
import { successSchema, type JsonSchema } from './output-schema-shapes.mts'

export type TopicRecommendationIdArgs = { id: string }

export const TOPIC_RECOMMENDATION_ID_SCHEMA = {
  type: 'string',
  description: 'The ID of a topic recommendation you submitted (a post ID or slug).',
}

/**
 * The recommendation the REST routes load for `:id`. A post that is missing or is not a topic
 * recommendation is "not found". Who may edit or withdraw it stays in the shared service commands.
 */
export async function loadTopicRecommendation(id: string) {
  const recommendation = asTopicRecommendationPost(await getPostByAnyCached(id))
  if (!recommendation) throw createHttpError(404, 'Recommendation not found')
  return recommendation
}

const POST = componentSchema('Post') as {
  properties: Record<string, JsonSchema>
  required: string[]
} & JsonSchema

const recommendationExtension = (POST.properties['topic_recommendation'] as JsonSchema)[
  'anyOf'
] as JsonSchema[]

/**
 * The post the PATCH route documents under `post`: the `Post` component narrowed to a topic
 * recommendation, so the extension is present. The tool's test pins it to the documented body.
 */
export const TOPIC_RECOMMENDATION_POST_SCHEMA: JsonSchema = {
  ...POST,
  properties: {
    ...POST.properties,
    post_type: { const: 'topic_recommendation' },
    topic_recommendation: recommendationExtension.find(branch => branch['type'] !== 'null'),
  },
  required: [...POST.required, 'topic_recommendation'].toSorted(),
}

export const TOPIC_RECOMMENDATION_RESULT_SCHEMA = successSchema({
  post: TOPIC_RECOMMENDATION_POST_SCHEMA,
})
export const TOPIC_RECOMMENDATION_SUCCESS_SCHEMA = successSchema({})
