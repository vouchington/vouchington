import { createStructuredDecisionBillingHooks } from '@agents/_shared'
import {
  createStructuredDecisionClient,
  structuredDecisionApiKey,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionClient,
  type StructuredDecisionFetch,
  type StructuredDecisionModelSelection,
} from '@modules/structured-decisions'

type AutotaggerProviderAttemptHook = NonNullable<StructuredDecisionAttemptHooks['beforeAttempt']>

type AutotaggerClientOptions = {
  /** The external-provider boundary is injectable only for deterministic tests. */
  fetch?: StructuredDecisionFetch
  /** Tests may avoid process-wide credential mutation; production reads the transport's key. */
  apiKey?: string
}

type AutotaggerClientInput = {
  classifierRunId: string
  postId: string | null
  selection: StructuredDecisionModelSelection
  beforeAttempt: AutotaggerProviderAttemptHook
}

function createTopicClassifierClient(
  workload: string,
  input: AutotaggerClientInput,
  options: AutotaggerClientOptions,
): StructuredDecisionClient {
  return createStructuredDecisionClient({
    transport: input.selection.provider,
    model: input.selection.model,
    apiKey: structuredDecisionApiKey(input.selection.provider, options.apiKey),
    fetch: options.fetch,
    hooks: createStructuredDecisionBillingHooks({
      workload,
      classifierRunId: input.classifierRunId,
      postId: input.postId,
      beforeAttempt: input.beforeAttempt,
    }),
  })
}

/**
 * Builds the C6 provider client only for a run that actually has remote work. Shared billing first
 * admits the spend, then the lifecycle's durable attempt reservation runs immediately before the
 * single physical request. Provider spend per run is capped at `maxAttempts` reserved attempts, and
 * persisted outcomes short-circuit any replay. A crash or lease loss between the provider returning
 * and the outcomes being persisted can still spend again, within that cap.
 */
export function createAutotaggerClient(
  input: AutotaggerClientInput,
  options: AutotaggerClientOptions = {},
): StructuredDecisionClient {
  return createTopicClassifierClient('autotagger', input, options)
}
