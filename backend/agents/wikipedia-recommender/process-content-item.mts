import type { SourceEntityType } from '@services/wikipedia-topic-recommendations'
import type { getPosts } from '@services/wikipedia-topic-recommendations/database'
import {
  runToolLoop,
  buildAgentTools,
  withCurry,
  DEFAULT_AGENT_MODEL,
  QUEUED_BACKGROUND_RETRY_POLICY,
} from '@agents/_shared'
import type { getSystemUserByUsername } from '@services/users/system-users'
import searchWikipediaTool from '@voucha/tools/search-wikipedia'
import getWikipediaSummaryTool from '@voucha/tools/get-wikipedia-summary'
import createWikipediaTopicRecommendationTool from '@voucha/tools/create-wikipedia-topic-recommendation'
import { WIKIPEDIA_RECOMMENDER_INSTRUCTIONS } from './instructions.mts'
import onError from '@modules/on-error'
import {
  isOpenAIRateLimitError,
  isOpenAIAuthError,
  isOpenAIServerError,
} from '@modules/openai-utils'
import { OpenAiSpendCapBreachError } from '@services/ai-usage'
import type { BasicUser } from '@services/users/types'
import type { RunToolLoopConfig, RunToolLoopResult } from '@agents/_shared/run-tool-loop'

const MAX_ITERATIONS = 10
const MAX_RECOMMENDATIONS = 5
const CREATE_TOPIC_TOOL_NAME = 'create_topic_recommendation'

export interface RecommendationStats {
  processed: number
  recommendations_created: number
  duplicates_skipped: number
  iterations: number
}

export interface WikipediaRecommenderDependencies {
  getPosts?: typeof getPosts
  getSystemUserByUsername?: typeof getSystemUserByUsername
  runToolLoop?: (config: RunToolLoopConfig) => Promise<RunToolLoopResult>
}

type ErrorWithCtx = Error & {
  tags?: Record<string, string | number | boolean> | null
  extra?: Record<string, unknown> | null
}

export async function processContentItem(
  entityType: SourceEntityType,
  entityId: string,
  content: string,
  wikipediaRecommenderUser: BasicUser,
  communityId: string | null,
  dependencies?: WikipediaRecommenderDependencies,
): Promise<Omit<RecommendationStats, 'processed'>> {
  const stats: Omit<RecommendationStats, 'processed'> = {
    recommendations_created: 0,
    duplicates_skipped: 0,
    iterations: 0,
  }

  const { agentTools } = buildAgentTools(wikipediaRecommenderUser, [
    searchWikipediaTool,
    getWikipediaSummaryTool,
    withCurry(createWikipediaTopicRecommendationTool, entityType, entityId),
  ])

  // Tracks remaining slots for the current batch. Decremented synchronously in
  // onBeforeCall (before any await) to prevent concurrent calls from exceeding the cap.
  // Reset each iteration via onIteration.
  let remainingRecommendationCalls = MAX_RECOMMENDATIONS

  try {
    const doRunToolLoop = dependencies?.runToolLoop ?? runToolLoop
    const result = await doRunToolLoop({
      model: DEFAULT_AGENT_MODEL,
      instructions: WIKIPEDIA_RECOMMENDER_INSTRUCTIONS,
      tools: agentTools,
      input: content,
      maxIterations: MAX_ITERATIONS,
      safetyIdentifier: wikipediaRecommenderUser.id,
      agentSlug: 'wikipedia-recommender',
      communityId,
      postId: entityId,
      maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries,
      extraParams: {
        service_tier: 'flex',
        prompt_cache_key: 'wikipedia-recommender-v1',
      },
      metadata: {
        type: 'wikipedia_recommender',
        entity_id: entityId,
        entity_type: entityType,
      },
      onIteration: () => {
        // Recompute remaining slots for this iteration's batch
        remainingRecommendationCalls = MAX_RECOMMENDATIONS - stats.recommendations_created
        if (stats.recommendations_created >= MAX_RECOMMENDATIONS) {
          return { stop: true, reason: 'max_recommendations' }
        }
        return undefined
      },
      onBeforeCall: toolCall => {
        if (toolCall.name !== CREATE_TOPIC_TOOL_NAME) return undefined
        if (remainingRecommendationCalls <= 0) {
          return {
            skip: true,
            skipResult: { skipped: true, reason: 'max_recommendations_reached' },
          }
        }
        // Decrement synchronously (before any await) so that concurrent tool calls
        // in the same batch can't each see remainingRecommendationCalls > 0 and all proceed.
        remainingRecommendationCalls--
        return undefined
      },
      onAfterCall: (toolCall, output) => {
        if (toolCall.name !== CREATE_TOPIC_TOOL_NAME) return
        if (typeof output !== 'object' || output === null || !('created' in output)) {
          onError(new Error(`Unexpected output shape from create_topic_recommendation`))
          return
        }
        const r = output as { created?: boolean }
        if (r.created) {
          stats.recommendations_created++
        } else {
          stats.duplicates_skipped++
        }
      },
      onCallError: (toolCall, error) => {
        // Enrich error with tool/entity context for Sentry (no-op for 4xx which onError suppresses).
        if (error && typeof error === 'object') {
          const e = error as ErrorWithCtx
          e.tags = { ...e.tags, tool_name: toolCall.name, entity_type: entityType }
          e.extra = { ...e.extra, entity_id: entityId }
        }
        onError(error)
      },
    })
    stats.iterations = result.iterations
  } catch (error) {
    if (error instanceof OpenAiSpendCapBreachError) throw error
    const err = error instanceof Error ? error : new Error(String(error))
    if (isOpenAIRateLimitError(err)) throw err
    if (isOpenAIAuthError(err)) throw err // systemic auth failure — propagate so job fails and alerts fire
    if (isOpenAIServerError(err)) return stats // flex-tier 5xx: SDK already retried; skip item silently
    onError(err)
  }

  return stats
}
