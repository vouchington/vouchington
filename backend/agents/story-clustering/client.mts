import { createStructuredDecisionBillingHooks } from '@agents/_shared'
import {
  createStructuredDecisionClient,
  structuredDecisionApiKey,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionClient,
  type StructuredDecisionFetch,
  type StructuredDecisionModelSelection,
} from '@modules/structured-decisions'

type StoryClusteringClientOptions = {
  /** The external-provider boundary is injectable only for deterministic tests. */
  fetch?: StructuredDecisionFetch
  /** Tests may avoid process-wide credential mutation; production reads the transport's key. */
  apiKey?: string
}

/**
 * Builds the provider client only for a run that actually has remote work. Shared billing first
 * admits the spend, then the lifecycle's durable attempt reservation runs immediately before the
 * single physical request, so spend per run is capped at the reserved attempts and persisted
 * outcomes short-circuit any replay. Spend is attributed to the `story-clustering` workload and to
 * no post.
 */
export function createStoryClusteringClient(
  input: {
    classifierRunId: string
    selection: StructuredDecisionModelSelection
    beforeAttempt: NonNullable<StructuredDecisionAttemptHooks['beforeAttempt']>
  },
  options: StoryClusteringClientOptions = {},
): StructuredDecisionClient {
  return createStructuredDecisionClient({
    transport: input.selection.provider,
    model: input.selection.model,
    apiKey: structuredDecisionApiKey(input.selection.provider, options.apiKey),
    fetch: options.fetch,
    hooks: createStructuredDecisionBillingHooks({
      workload: 'story-clustering',
      classifierRunId: input.classifierRunId,
      postId: null,
      beforeAttempt: input.beforeAttempt,
    }),
  })
}
