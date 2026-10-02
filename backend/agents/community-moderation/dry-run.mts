import { toClassifierQuestions } from '@agents/classifiers/bindings'
import { resultsForShard } from '@agents/classifiers/results'
import {
  sanitizeClassifierExternalContentParts,
  type ClassifierExternalContentPart,
} from '@agents/classifiers/safe-content'
import type { StructuredDecisionFetch } from '@modules/structured-decisions'
import {
  getCommunityPromptDryRunConfiguration,
  isCommunityPromptFlagged,
  type CommunityPromptDryRunConfiguration,
} from '@services/community-agent-prompts'
import type { ClassifierModelProvider } from '@voucha/types'
import { buildCommunityModerationBindings } from './classifier-run-bindings.mts'
import { createCommunityPromptDryRunClient } from './dry-run-client.mts'

/** One provider call's deadline; a stalled call fails the preview instead of hanging the request. */
const DEFAULT_CALL_TIMEOUT_MS = 30_000

export type CommunityPromptDryRunDependencies = {
  /** The active `community-moderation` classifier; injectable only for deterministic tests. */
  getConfiguration?: () => Promise<CommunityPromptDryRunConfiguration>
  /** The external-provider boundary is injectable only for deterministic tests. */
  fetch?: StructuredDecisionFetch
  /** Tests may avoid process-wide credential mutation; production uses OPENROUTER_API_KEY. */
  apiKey?: string
  /** Overrides the per-call deadline; injectable only so tests need not wait it out. */
  callTimeoutMs?: number
}

export type CommunityPromptDryRunVerdict = { flagged: boolean; probability: number }

export type CommunityPromptDryRun = {
  modelName: string
  modelProvider: ClassifierModelProvider
  /**
   * Asks the one rule about one piece of content. Bounded by a per-call deadline and by `signal`;
   * persists nothing but billing.
   */
  classify: (
    parts: readonly ClassifierExternalContentPart[],
    signal?: AbortSignal,
  ) => Promise<CommunityPromptDryRunVerdict>
}

/**
 * A no-persist preview of what community moderation would conclude about one rule. It asks the
 * same question, over the same sanitized content, of the same pinned classifier model as a real
 * run, and judges the answer by the same threshold, but it makes one call per piece of content and
 * writes no receipt, attempt, `agent_moderations` row or other classifier lifecycle state: only the
 * cost ledger (and an accounting-uncertainty latch) record that it ran.
 */
export async function prepareCommunityPromptDryRun(
  input: { communityId: string; prompt: { id: string; text: string } },
  dependencies: CommunityPromptDryRunDependencies = {},
): Promise<CommunityPromptDryRun> {
  const getConfiguration = dependencies.getConfiguration ?? getCommunityPromptDryRunConfiguration
  const configuration = await getConfiguration()
  const bindings = await buildCommunityModerationBindings(configuration.questionTemplate, [
    input.prompt,
  ])
  const questions = toClassifierQuestions(bindings)
  const client = createCommunityPromptDryRunClient(
    { communityId: input.communityId, modelProvider: configuration.modelProvider },
    { fetch: dependencies.fetch, apiKey: dependencies.apiKey },
  )
  const callTimeoutMs = dependencies.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS
  return {
    modelName: configuration.modelName,
    modelProvider: configuration.modelProvider,
    classify: async (parts, signal) => {
      const state = await sanitizeClassifierExternalContentParts(parts, '\n\n', {
        source: 'post',
        contentType: 'user_post',
      })
      const request = { state, questions }
      const deadline = AbortSignal.timeout(callTimeoutMs)
      const response = await client.decide(
        request,
        signal ? AbortSignal.any([signal, deadline]) : deadline,
      )
      // One binding in, so a decoded response holds exactly one result (it throws otherwise).
      const [result] = resultsForShard(request, response, bindings)
      return {
        flagged: isCommunityPromptFlagged(result.probability, configuration.thresholds),
        probability: result.probability,
      }
    },
  }
}
