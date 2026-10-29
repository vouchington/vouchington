import { recordAgentResponseUsage, structuredDecisionUsageRecord } from '@agents/_shared'
import {
  createStructuredDecisionClient,
  structuredDecisionApiKey,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionClient,
  type StructuredDecisionFetch,
  type StructuredDecisionModelSelection,
} from '@modules/structured-decisions'
import { assertDailySpendCapNotBreached, SpendCapBreachError } from '@services/ai-usage'

/**
 * The cost-ledger and spend-cap label of a moderator's rule preview. It is deliberately not the
 * `community-moderation` classifier slug: a dry run is not a classifier run, so its spend stays out
 * of the per-run fan-out and the classifier usage report while still counting against the daily cap.
 */
const DRY_RUN_WORKLOAD = 'community-moderation-dry-run'

type CommunityPromptDryRunClientOptions = {
  /** The external-provider boundary is injectable only for deterministic tests. */
  fetch?: StructuredDecisionFetch
  /** Tests may avoid process-wide credential mutation; production reads the transport's key. */
  apiKey?: string
}

/**
 * Billing hooks for a preview that has no classifier run: the same three obligations a run's hooks
 * carry (admit under the daily cap before the request and record what the provider billed),
 * with no durable attempt reservation because a dry run keeps no
 * lifecycle state to reserve against.
 */
function createDryRunBillingHooks(communityId: string): StructuredDecisionAttemptHooks {
  return {
    beforeAttempt: async () => {
      const breach = await assertDailySpendCapNotBreached(DRY_RUN_WORKLOAD)
      if (breach) throw new SpendCapBreachError(breach)
    },
    onBilledResponse: async response => {
      await recordAgentResponseUsage({
        ...structuredDecisionUsageRecord(response),
        agentSlug: DRY_RUN_WORKLOAD,
        communityId,
        postId: null,
        createdAt: response.requestStartedAt,
      })
    },
  }
}

/** The provider client for a moderator's rule preview; it persists nothing but billing. */
export function createCommunityPromptDryRunClient(
  input: { communityId: string; selection: StructuredDecisionModelSelection },
  options: CommunityPromptDryRunClientOptions = {},
): StructuredDecisionClient {
  return createStructuredDecisionClient({
    transport: input.selection.provider,
    model: input.selection.model,
    apiKey: structuredDecisionApiKey(input.selection.provider, options.apiKey),
    fetch: options.fetch,
    hooks: createDryRunBillingHooks(input.communityId),
  })
}
