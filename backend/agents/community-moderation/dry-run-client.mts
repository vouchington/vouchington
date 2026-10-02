import { recordAgentResponseUsage } from '@agents/_shared'
import {
  createStructuredDecisionClient,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionClient,
  type StructuredDecisionFetch,
} from '@modules/structured-decisions'
import {
  assertOpenAiSpendCapNotBreached,
  latchAccountingUncertainty,
  OpenAiSpendCapBreachError,
} from '@services/ai-usage'
import { getUtcDayFromDate } from '@ts-shared/utils/dates'
import type { ClassifierModelProvider } from '@voucha/types'

/**
 * The cost-ledger and spend-cap label of a moderator's rule preview. It is deliberately not the
 * `community-moderation` classifier slug: a dry run is not a classifier run, so its spend stays out
 * of the per-run fan-out and the classifier usage report while still counting against the daily cap.
 */
const DRY_RUN_WORKLOAD = 'community-moderation-dry-run'

type CommunityPromptDryRunClientOptions = {
  /** The external-provider boundary is injectable only for deterministic tests. */
  fetch?: StructuredDecisionFetch
  /** Tests may avoid process-wide credential mutation; production uses OPENROUTER_API_KEY. */
  apiKey?: string
}

/**
 * A dry run uses the same provider and key as a real run. An operator who reconfigures the seeded
 * classifier to another provider gets no key source, so building the client throws before any spend.
 */
function resolveApiKey(
  provider: ClassifierModelProvider,
  options: CommunityPromptDryRunClientOptions,
): string {
  if (provider !== 'openrouter') {
    throw new Error(
      `Community moderation classifier has no API key source for provider '${provider}'`,
    )
  }
  return options.apiKey ?? process.env.OPENROUTER_API_KEY ?? ''
}

/**
 * Billing hooks for a preview that has no classifier run: the same three obligations a run's hooks
 * carry (admit under the daily cap before the request, record what the provider billed, latch an
 * ambiguous billed attempt), with no durable attempt reservation because a dry run keeps no
 * lifecycle state to reserve against.
 */
function createDryRunBillingHooks(communityId: string): StructuredDecisionAttemptHooks {
  return {
    beforeAttempt: async () => {
      const breach = await assertOpenAiSpendCapNotBreached(DRY_RUN_WORKLOAD)
      if (breach) throw new OpenAiSpendCapBreachError(breach)
    },
    onBilledResponse: async response => {
      await recordAgentResponseUsage({
        response: {
          id: typeof response.id === 'string' ? response.id : undefined,
          model: typeof response.model === 'string' ? response.model : undefined,
          usage: response.usage,
          service_tier: undefined,
        },
        agentSlug: DRY_RUN_WORKLOAD,
        communityId,
        postId: null,
        createdAt: response.requestStartedAt,
      })
    },
    onUnknownBilledAttempt: async attempt => {
      await latchAccountingUncertainty({
        requestDay: getUtcDayFromDate(attempt.requestStartedAt),
        source: 'unknown_billed_attempt',
      })
    },
  }
}

/** The provider client for a moderator's rule preview; it persists nothing but billing. */
export function createCommunityPromptDryRunClient(
  input: { communityId: string; modelProvider: ClassifierModelProvider },
  options: CommunityPromptDryRunClientOptions = {},
): StructuredDecisionClient {
  return createStructuredDecisionClient({
    transport: input.modelProvider,
    apiKey: resolveApiKey(input.modelProvider, options),
    fetch: options.fetch,
    hooks: createDryRunBillingHooks(input.communityId),
  })
}
