import {
  createOpenAIResponse,
  parseLLMJsonResponse,
  callRecordingAgentResponseUsage,
  SYNCHRONOUS_REQUEST_RETRY_POLICY,
} from '@agents/_shared'
import { extractTextFromOpenAIResponse } from '@modules/openai-utils'
import { prepareModerationInput } from '@agents/moderation/openai-moderation'
import type { CommunityAgentPrompt } from '@services/community-agent-prompts'
import type { CommunityAgentPromptSimulationPost } from '@services/community-agent-prompts/simulations'

export interface CommunityPromptSimulationResult {
  post_id: string
  flagged: boolean
  reason: string
}

interface CommunityPromptSimulationResponse {
  results: CommunityPromptSimulationResult[]
}

const MAX_SIMULATION_POST_INPUT_CHARS = 4000

const simulationJsonSchema = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          post_id: { type: 'string' },
          flagged: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['post_id', 'flagged', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
} as const

export async function simulateCommunityPromptOnPosts(
  prompt: CommunityAgentPrompt,
  posts: CommunityAgentPromptSimulationPost[],
  options: {
    currentUserId: string
    promptOverride?: string
    createResponse?: typeof createOpenAIResponse
  },
): Promise<CommunityPromptSimulationResult[]> {
  if (posts.length === 0) return []

  const createResponse = options.createResponse ?? createOpenAIResponse
  const agentSlug = `community-prompt-${prompt.id}`

  // Records the ledger row for both outcomes: a successful response, or a failed/incomplete one
  // (which still billed tokens) before the error propagates, so the moderator's retry doesn't
  // compound an unrecorded charge with another one.
  const response = await callRecordingAgentResponseUsage(
    () =>
      createResponse(
        {
          model: prompt.model_name,
          input: buildSimulationInput(posts),
          instructions: buildSimulationInstructions(options.promptOverride ?? prompt.prompt),
          metadata: {
            type: 'community-prompt-simulation',
            prompt_id: prompt.id,
            moderator_id: prompt.agent_id,
            sample_count: String(posts.length),
          },
          service_tier: 'flex',
          prompt_cache_key: prompt.id,
          safety_identifier: options.currentUserId,
          text: {
            format: {
              type: 'json_schema',
              name: 'community_prompt_simulation',
              schema: simulationJsonSchema,
              json_schema: {
                schema: simulationJsonSchema,
              },
            },
          },
        } as unknown as Parameters<typeof createResponse>[0],
        { maxRetries: SYNCHRONOUS_REQUEST_RETRY_POLICY.maxRetries },
      ),
    { agentSlug, communityId: prompt.community_id },
  )

  return parseSimulationResponse(response, posts)
}

function buildSimulationInstructions(prompt: string): string {
  return `${prompt}

Evaluate each candidate post independently. Return exactly one result for each post_id. Do not apply moderation actions; this is a dry run.`
}

function buildSimulationInput(posts: CommunityAgentPromptSimulationPost[]): string {
  return JSON.stringify({
    posts: posts.map(post => ({
      post_id: post.id,
      content: truncateSimulationPostInput(prepareModerationInput(post.title, post.markdown)),
    })),
  })
}

function truncateSimulationPostInput(input: string): string {
  if (input.length <= MAX_SIMULATION_POST_INPUT_CHARS) return input
  return `${input.slice(0, MAX_SIMULATION_POST_INPUT_CHARS - 3).trimEnd()}...`
}

function parseSimulationResponse(
  response: Awaited<ReturnType<typeof createOpenAIResponse>>,
  posts: CommunityAgentPromptSimulationPost[],
): CommunityPromptSimulationResult[] {
  const text = extractTextFromOpenAIResponse(response)
  const parsed = parseLLMJsonResponse<CommunityPromptSimulationResponse>(text)
  if (!parsed || !Array.isArray(parsed.results)) {
    throw new TypeError(`Invalid community prompt simulation results: ${JSON.stringify(parsed)}`)
  }

  const expectedIds = new Set(posts.map(post => post.id))
  const resultsByPostId = new Map<string, CommunityPromptSimulationResult>()
  for (const result of parsed.results) {
    if (
      typeof result?.post_id !== 'string' ||
      typeof result.flagged !== 'boolean' ||
      typeof result.reason !== 'string' ||
      !expectedIds.has(result.post_id)
    ) {
      throw new TypeError(`Invalid community prompt simulation result: ${JSON.stringify(result)}`)
    }
    resultsByPostId.set(result.post_id, {
      post_id: result.post_id,
      flagged: result.flagged,
      reason: result.reason,
    })
  }

  if (resultsByPostId.size !== posts.length) {
    throw new TypeError('Community prompt simulation did not return one result per post')
  }

  return posts.map(post => resultsByPostId.get(post.id)!)
}
