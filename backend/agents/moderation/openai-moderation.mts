import type { ActiveModeratorConfig } from '@services/moderation'
import { extractTextFromOpenAIResponse } from '@modules/openai-utils'
import type { OpenAIUsage } from '@modules/openai-utils/create-response'
import {
  createOpenAIResponse,
  parseLLMJsonResponse,
  callRecordingAgentResponseUsage,
  QUEUED_BACKGROUND_RETRY_POLICY,
  type RetryPolicy,
} from '@agents/_shared'
import { getEntityRelations, SYSTEM_ENTITY_RELATION_VIEWER } from '@services/entity-relations'
import type { Post } from '@services/posts/types'
import {
  runPoliticsAverseModeration,
  POLITICS_AVERSE_MODERATOR_SLUG,
} from '@agents/politics-averse'
import { createPostModerationResponse } from './openai-moderation-request.mts'

interface ModerationResult {
  flagged: boolean
  reason: string
  categories?: string[]
}

// politics-averse runs its own OpenAI calls through runToolLoop and records usage at that seam
// (see run-tool-loop.mts); this branch has no model/service_tier to report.
export type OpenAIModerationCallResult =
  | { result: ModerationResult; usage: OpenAIUsage; model: string; service_tier: string }
  | { result: ModerationResult; usage: null }

interface CallOpenAIModerationDeps {
  getEntityRelations?: typeof getEntityRelations
  runPoliticsAverseModeration?: typeof runPoliticsAverseModeration
  createOpenAIResponse?: typeof createOpenAIResponse
  // Defaults to the queued-worker budget: production moderation runs through glide-mq, which
  // already retries the whole job. Callers on a synchronous, user-waiting path (agent-prompt
  // test-runs) must pass SYNCHRONOUS_REQUEST_RETRY_POLICY instead.
  retryPolicy?: RetryPolicy
}

// Intentionally does not sanitize: moderation must see raw content to detect violations; it
// evaluates the content rather than acting on it as instructions, so injection isn't a concern.
export function prepareModerationInput(
  title: string,
  markdown: string,
  imageCaptions: string[] = [],
): string {
  const inputParts: string[] = []
  if (title.trim()) {
    inputParts.push(`Title: ${title}`)
  }
  if (markdown.trim()) {
    inputParts.push(`Content: ${markdown}`)
  }
  if (imageCaptions.length > 0) {
    inputParts.push(`Images:\n${imageCaptions.map(caption => `- ${caption}`).join('\n')}`)
  }
  return inputParts.join('\n\n')
}

export async function callOpenAIModeration(
  input: string,
  config: ActiveModeratorConfig,
  post: Post,
  communityId: string | null,
  deps: CallOpenAIModerationDeps = {},
): Promise<OpenAIModerationCallResult> {
  const getRelations = deps.getEntityRelations ?? getEntityRelations
  const runPoliticsAverse = deps.runPoliticsAverseModeration ?? runPoliticsAverseModeration
  const createResponse = deps.createOpenAIResponse ?? createOpenAIResponse
  const retryPolicy = deps.retryPolicy ?? QUEUED_BACKGROUND_RETRY_POLICY

  if (config.moderator_slug === POLITICS_AVERSE_MODERATOR_SLUG) {
    const relatedUrls = await getRelatedUrlsForModeration(post.id, getRelations)
    const politicsInput =
      relatedUrls.length > 0
        ? `${input}\n\nRelated URLs:\n${relatedUrls.map(url => `- ${url}`).join('\n')}`
        : input
    const result = await runPoliticsAverse(config, post, politicsInput)
    return { result, usage: null }
  }

  // Record actual spend regardless of whether parsing below succeeds (both on success and on a
  // failed/incomplete response, which still billed tokens) — a malformed/unextractable response
  // (e.g. a refusal) still billed tokens, and parseModerationResponse throws on those.
  const response = await callRecordingAgentResponseUsage(
    () => createPostModerationResponse(input, config, post, createResponse, retryPolicy),
    { agentSlug: config.moderator_slug, communityId, postId: post.id },
  )

  const usage = response.usage ?? null
  if (!usage) {
    return { result: parseModerationResponse(response), usage: null }
  }
  return {
    result: parseModerationResponse(response),
    usage,
    // Prefer what OpenAI actually served; fall back to a distinguishable sentinel only if the
    // response omits it, so a systematic mismatch stays visible instead of silently mispriced.
    model: response.model ?? 'unknown-model',
    service_tier: response.service_tier ?? 'unknown-tier',
  }
}

function parseModerationResponse(
  response: Awaited<ReturnType<typeof createPostModerationResponse>>,
) {
  const text = extractTextFromOpenAIResponse(response)
  return parseModerationResults(text)
}

function parseModerationResults(text: string): ModerationResult {
  const results = parseLLMJsonResponse<ModerationResult>(text)

  if (typeof results.flagged !== 'boolean' || typeof results.reason !== 'string') {
    throw new TypeError(`Invalid moderation results: ${JSON.stringify(results)}`)
  }
  if (
    results.categories !== undefined &&
    (!Array.isArray(results.categories) ||
      !results.categories.every(category => typeof category === 'string'))
  ) {
    throw new TypeError(`Invalid moderation results: ${JSON.stringify(results)}`)
  }

  return results
}

async function getRelatedUrlsForModeration(
  postId: string,
  getRelations: typeof getEntityRelations = getEntityRelations,
): Promise<string[]> {
  const relations = await getRelations('post', postId, 'related', 'url', {
    viewer: SYSTEM_ENTITY_RELATION_VIEWER,
    limit: 5,
    sort: 'best',
  })

  return relations.flatMap(relation => {
    const url = relation.object_data?.url
    return typeof url === 'string' ? [url] : []
  })
}
