import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { IDENTITY_REQUIRED } from '@modules/on-error/error-codes'
import {
  admitDelegatedContribution,
  executePreparedContribution,
} from '@services/contribution-gating'
import { getUserActivePlan } from '@services/memberships'
import { currentUserCanCreatePost } from '@services/posts/authorization'
import {
  assertValidCreateTopicRecommendationInput,
  prepareTopicRecommendation,
  type CreateTopicRecommendationInput,
  type TopicRecommendationPost,
} from '@services/topic-recommendations'
import type { Tool } from '@services/openai-agents/tool-types'
import { requireActiveToolUser } from './private-user.mts'
import updateTool from './update-topic-recommendation.mts'
import { TOPIC_RECOMMENDATION_RESULT_SCHEMA } from './topic-recommendation-tool-support.mts'
import { toMcpRecommendation } from './topic-recommendation-read-output.mts'

type Args = CreateTopicRecommendationInput & { idempotency_key: string }
const { id: _id, ...fields } = updateTool.schema.parameters!['properties'] as Record<
  string,
  unknown
>

const tool: Tool<Args, { success: true; post: TopicRecommendationPost }> = {
  schema: {
    name: 'create_topic_recommendation',
    type: 'function',
    description:
      'Submit a pending topic recommendation. Reuse the same UUID idempotency_key and body to safely retry; a moderator decides whether to approve it.',
    parameters: {
      type: 'object',
      properties: {
        ...fields,
        idempotency_key: {
          type: 'string',
          format: 'uuid',
          description: 'A UUID for this submission and its retries.',
        },
      },
      required: ['idempotency_key', 'markdown', 'topic_title', 'topic_slug'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Create Topic Recommendation',
    plan: 'plus',
    requiredScopes: { mcp: ['topic-recommendations:read', 'topic-recommendations:write'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    api: [{ method: 'POST', path: '/api/v1/topic-recommendations' }],
    outputSchema: TOPIC_RECOMMENDATION_RESULT_SCHEMA,
  },
  function: currentUser => async args => {
    const user = await requireActiveToolUser(currentUser)
    if (!currentUserCanCreatePost(user))
      throw createCodedError(403, 'An identity is required to create posts', IDENTITY_REQUIRED)
    const { idempotency_key, ...body } = args
    const membershipPlan = await getUserActivePlan(user.id)
    assertValidCreateTopicRecommendationInput(body)
    const post = await admitDelegatedContribution({
      currentUser: user,
      membershipPlan,
      source: 'topic_recommendation',
      scope: 'topic_recommendation',
      postType: 'topic_recommendation',
      idempotencyKey: idempotency_key,
      intent: { route: 'topic-recommendations.create', body },
      execute: query =>
        executePreparedContribution(query, () =>
          prepareTopicRecommendation(user, getRequestContentProvenance(), body, { query }),
        ),
    })
    return { success: true, post: await toMcpRecommendation(post) }
  },
}

export default tool
