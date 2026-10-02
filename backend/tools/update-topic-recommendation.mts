import type { BasicUser } from '@services/users/types'
import {
  updateTopicRecommendation,
  type TopicRecommendationPost,
  type UpdateTopicRecommendationInput,
} from '@services/topic-recommendations'
import { requireActiveToolUser } from './private-user.mts'
import {
  loadTopicRecommendation,
  TOPIC_RECOMMENDATION_ID_SCHEMA,
  TOPIC_RECOMMENDATION_RESULT_SCHEMA,
} from './topic-recommendation-tool-support.mts'
import type { Tool } from '@services/openai-agents/tool-types'

type UpdateTopicRecommendationArgs = UpdateTopicRecommendationInput & { id: string }

const text = (description: string) => ({ type: 'string', description })
const textList = (description: string) => ({
  type: 'array',
  items: { type: 'string' },
  description,
})

const tool: Tool<UpdateTopicRecommendationArgs, { success: true; post: TopicRecommendationPost }> =
  {
    schema: {
      name: 'update_topic_recommendation',
      type: 'function',
      description:
        'Edit a topic recommendation you submitted while it is still pending. Send only the fields to change. A recommendation that was approved, rejected or withdrawn can no longer be edited. This does not approve it; a moderator does that.',
      parameters: {
        type: 'object',
        properties: {
          id: TOPIC_RECOMMENDATION_ID_SCHEMA,
          title: text('The recommendation title.'),
          markdown: text('The reason for the recommendation, as Markdown.'),
          topic_title: text('The title of the topic being recommended.'),
          topic_slug: text('The slug of the topic being recommended.'),
          topic_markdown: text('The description of the topic, as Markdown.'),
          topic_hostname: text('The primary hostname of the topic.'),
          topic_hostnames: textList('Every hostname of the topic.'),
          topic_aliases: textList('Other names the topic goes by.'),
          topic_type: {
            type: 'string',
            enum: ['card', 'referral_program', 'topic'],
            description: 'What kind of topic is being recommended.',
          },
          example_referral_link: text('An example referral link for the topic.'),
          landing_page_urls: textList('Landing page URLs for the topic.'),
        },
        required: ['id'],
        additionalProperties: false,
      },
      strict: null,
    },
    meta: {
      surfaces: ['mcp'],
      title: 'Update Topic Recommendation',
      plan: 'plus',
      requiredScopes: { mcp: ['topic-recommendations:read', 'topic-recommendations:write'] },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      api: [{ method: 'PATCH', path: '/api/v1/topic-recommendations/:id' }],
      outputSchema: TOPIC_RECOMMENDATION_RESULT_SCHEMA,
    },
    function: (currentUser: BasicUser) => async (args: UpdateTopicRecommendationArgs) => {
      const user = await requireActiveToolUser(currentUser)
      const { id, ...changes } = args
      const post = await updateTopicRecommendation(user, await loadTopicRecommendation(id), changes)
      return { success: true, post }
    },
  }

export default tool
