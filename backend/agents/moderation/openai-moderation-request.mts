import { FLEX_SERVICE_TIER } from '@modules/openai-utils/pricing'
import {
  createOpenAIResponse,
  QUEUED_BACKGROUND_RETRY_POLICY,
  type RetryPolicy,
} from '@agents/_shared'
import type { ActiveModeratorConfig } from '@services/moderation'
import type { Post } from '@services/posts/types'
import { MARKETPLACE_CATEGORIES } from './constants.mts'

const openAIPostLLMModerationJSONSchema = {
  type: 'object',
  properties: {
    flagged: { type: 'boolean' },
    reason: { type: 'string' },
    categories: {
      type: 'array',
      items: { type: 'string', enum: [...MARKETPLACE_CATEGORIES] },
    },
  },
  required: ['flagged', 'reason'],
  additionalProperties: false,
} as const

export async function createPostModerationResponse(
  input: string,
  config: ActiveModeratorConfig,
  post: Post,
  createResponse: typeof createOpenAIResponse = createOpenAIResponse,
  retryPolicy: RetryPolicy = QUEUED_BACKGROUND_RETRY_POLICY,
) {
  return createResponse(
    {
      model: config.prompt.model_name,
      input: input || ' ',
      instructions: config.prompt.prompt,
      metadata: {
        type: 'post-llm-moderation',
        prompt_id: config.prompt.id,
        moderator_id: config.moderator_id,
        // Responses API metadata values must be strings; a dry run (agent-prompt test-runs) has
        // no real post, so omit rather than send post_id: null, which OpenAI rejects.
        ...(post.id ? { post_id: post.id } : {}),
        post_type: post.post_type,
      },
      service_tier: FLEX_SERVICE_TIER,
      prompt_cache_key: config.prompt.id,
      safety_identifier: post.created_by_id ?? post.id,
      text: {
        format: {
          type: 'json_schema',
          name: 'post_llm_moderation',
          schema: openAIPostLLMModerationJSONSchema,
          json_schema: {
            schema: openAIPostLLMModerationJSONSchema,
          },
        },
      },
    } as unknown as Parameters<typeof createResponse>[0],
    { maxRetries: retryPolicy.maxRetries },
  )
}
