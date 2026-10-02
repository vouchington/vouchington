import { createStructuredDecisionBillingHooks } from '@agents/_shared'
import {
  createStructuredDecisionClient,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionClient,
  type StructuredDecisionFetch,
} from '@modules/structured-decisions'
import type { ClassifierModelProvider } from '@voucha/types'

type StoryClusteringClientOptions = {
  /** The external-provider boundary is injectable only for deterministic tests. */
  fetch?: StructuredDecisionFetch
  /** Tests may avoid process-wide credential mutation; production uses OPENROUTER_API_KEY. */
  apiKey?: string
}

/**
 * The seeded `story-clustering-classifier` is always `openrouter`. An operator reconfiguring it to
 * another provider gets no key source, so building the client throws and the run ends through the
 * shared client-unavailable path instead of spending or looping.
 */
function resolveApiKey(provider: ClassifierModelProvider, options: StoryClusteringClientOptions) {
  if (provider !== 'openrouter') {
    throw new Error(`Story clustering classifier has no API key source for provider '${provider}'`)
  }
  return options.apiKey ?? process.env.OPENROUTER_API_KEY ?? ''
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
    modelProvider: ClassifierModelProvider
    beforeAttempt: NonNullable<StructuredDecisionAttemptHooks['beforeAttempt']>
  },
  options: StoryClusteringClientOptions = {},
): StructuredDecisionClient {
  return createStructuredDecisionClient({
    transport: input.modelProvider,
    apiKey: resolveApiKey(input.modelProvider, options),
    fetch: options.fetch,
    hooks: createStructuredDecisionBillingHooks({
      workload: 'story-clustering',
      classifierRunId: input.classifierRunId,
      postId: null,
      beforeAttempt: input.beforeAttempt,
    }),
  })
}
