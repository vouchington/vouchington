import type { BasicUser } from '@services/users/types'
import { deletePendingRecommendation } from '@services/topic-recommendations'
import { requireActiveToolUser } from './private-user.mts'
import {
  loadTopicRecommendation,
  TOPIC_RECOMMENDATION_ID_SCHEMA,
  TOPIC_RECOMMENDATION_SUCCESS_SCHEMA,
  type TopicRecommendationIdArgs,
} from './topic-recommendation-tool-support.mts'
import type { Tool } from '@services/openai-agents/tool-types'

const tool: Tool<TopicRecommendationIdArgs, { success: true }> = {
  schema: {
    name: 'withdraw_topic_recommendation',
    type: 'function',
    description:
      'Withdraw a topic recommendation you submitted while it is still pending. It is removed and can no longer be edited. A recommendation that was already approved or rejected cannot be withdrawn.',
    parameters: {
      type: 'object',
      properties: { id: TOPIC_RECOMMENDATION_ID_SCHEMA },
      required: ['id'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Withdraw Topic Recommendation',
    plan: 'plus',
    requiredScopes: { mcp: ['topic-recommendations:read', 'topic-recommendations:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: [{ method: 'DELETE', path: '/api/v1/topic-recommendations/:id' }],
    outputSchema: TOPIC_RECOMMENDATION_SUCCESS_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: TopicRecommendationIdArgs) => {
    const user = await requireActiveToolUser(currentUser)
    await deletePendingRecommendation(user, await loadTopicRecommendation(args.id))
    return { success: true }
  },
}

export default tool
