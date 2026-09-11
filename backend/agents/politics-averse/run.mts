import type { ActiveModeratorConfig } from '@services/moderation'
import {
  buildAgentTools,
  parseLLMJsonResponse,
  runToolLoop,
  QUEUED_BACKGROUND_RETRY_POLICY,
} from '@agents/_shared'
import { getPrivateUserByAny } from '@services/users'
import getDomainRatingsTool from '@voucha/tools/get-domain-ratings'
import { FLEX_SERVICE_TIER } from '@modules/openai-utils/pricing'
import type { Post } from '@services/posts/types'
import { POLITICS_AVERSE_MAX_ITERATIONS } from './constants.mts'

interface ModerationResult {
  flagged: boolean
  reason: string
}

const openAIPostLLMModerationJSONSchema = {
  type: 'object',
  properties: {
    flagged: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['flagged', 'reason'],
  additionalProperties: false,
} as const

export async function runPoliticsAverseModeration(
  config: ActiveModeratorConfig,
  post: Post,
  input: string,
  deps: {
    runToolLoop?: typeof runToolLoop
  } = {},
): Promise<ModerationResult> {
  const runLoop = deps.runToolLoop ?? runToolLoop
  const systemUser = await getPrivateUserByAny(config.system_user_id)
  if (!systemUser) {
    throw new Error(`Moderator misconfigured: system user not found (${config.system_user_id})`)
  }

  const instructions = buildPoliticsAverseInstructions(config.prompt.prompt)
  const { agentTools } = buildAgentTools(systemUser, [getDomainRatingsTool])

  const { text } = await runLoop({
    model: config.prompt.model_name,
    instructions,
    tools: agentTools,
    input: input || ' ',
    maxIterations: POLITICS_AVERSE_MAX_ITERATIONS,
    safetyIdentifier: post.created_by_id ?? post.id,
    agentSlug: config.moderator_slug,
    communityId: post.community_id,
    postId: post.id,
    maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries,
    metadata: {
      type: 'post-llm-moderation',
      prompt_id: config.prompt.id,
      moderator_id: config.moderator_id,
      post_id: post.id,
      post_type: post.post_type,
    },
    extraParams: {
      service_tier: FLEX_SERVICE_TIER,
      prompt_cache_key: config.prompt.id,
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
    },
  })

  if (!text) {
    throw new TypeError('Invalid moderation results: empty response')
  }

  return parseModerationResults(text)
}

function buildPoliticsAverseInstructions(prompt: string): string {
  return `${prompt}

Operational requirements:
- You may use the get_domain_ratings tool to inspect cited domains or related URLs before deciding.
- Use the tool when source credibility or source reputation matters to the decision.
- Allow factual reporting of political news and events.
- Allow political analysis only when claims are grounded in reputable sources.
- Flag partisan persuasion, campaign-style advocacy, or unsupported political claims.
- Return JSON only with keys flagged and reason.`
}

function parseModerationResults(text: string): ModerationResult {
  const results = parseLLMJsonResponse<ModerationResult>(text)

  if (typeof results.flagged !== 'boolean' || typeof results.reason !== 'string') {
    throw new TypeError(`Invalid moderation results: ${JSON.stringify(results)}`)
  }

  return results
}
