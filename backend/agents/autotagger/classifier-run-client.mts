import { createStructuredDecisionBillingHooks } from '@agents/_shared'
import {
  createStructuredDecisionClient,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionClient,
  type StructuredDecisionFetch,
} from '@modules/structured-decisions'
import type { ClassifierModelProvider } from '@voucha/types'

type AutotaggerProviderAttemptHook = NonNullable<StructuredDecisionAttemptHooks['beforeAttempt']>

type AutotaggerClientOptions = {
  /** The external-provider boundary is injectable only for deterministic tests. */
  fetch?: StructuredDecisionFetch
  /** Tests may avoid process-wide credential mutation; production uses OPENROUTER_API_KEY. */
  apiKey?: string
}

/**
 * The seeded `tagging` classifier is always `openrouter`. An operator reconfiguring it to another
 * provider gets no key source, so building the client throws and the run ends through the shared
 * client-unavailable path instead of spending or looping. An unset key is rejected by the client.
 */
function resolveApiKey(provider: ClassifierModelProvider, options: AutotaggerClientOptions) {
  if (provider !== 'openrouter') {
    throw new Error(`Autotagger classifier has no API key source for provider '${provider}'`)
  }
  return options.apiKey ?? process.env.OPENROUTER_API_KEY ?? ''
}

/**
 * Builds the C6 provider client only for a run that actually has remote work. Shared billing first
 * admits the spend, then the lifecycle's durable attempt reservation runs immediately before the
 * single physical request. Provider spend per run is capped at `maxAttempts` reserved attempts, and
 * persisted outcomes short-circuit any replay. A crash or lease loss between the provider returning
 * and the outcomes being persisted can still spend again, within that cap.
 */
export function createAutotaggerClient(
  input: {
    postId: string | null
    modelProvider: ClassifierModelProvider
    beforeAttempt: AutotaggerProviderAttemptHook
  },
  options: AutotaggerClientOptions = {},
): StructuredDecisionClient {
  return createStructuredDecisionClient({
    transport: input.modelProvider,
    apiKey: resolveApiKey(input.modelProvider, options),
    fetch: options.fetch,
    hooks: createStructuredDecisionBillingHooks({
      workload: 'autotagger',
      postId: input.postId,
      beforeAttempt: input.beforeAttempt,
    }),
  })
}
