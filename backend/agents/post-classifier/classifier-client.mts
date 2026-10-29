import { createStructuredDecisionBillingHooks } from '@agents/_shared'
import {
  createStructuredDecisionClient,
  structuredDecisionApiKey,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionClient,
  type StructuredDecisionFetch,
  type StructuredDecisionModelSelection,
} from '@modules/structured-decisions'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'

type PostClassifierProviderAttemptHook = NonNullable<
  StructuredDecisionAttemptHooks['beforeAttempt']
>

type PostClassifierClientOptions = {
  /** The external-provider boundary is injectable only for deterministic tests. */
  fetch?: StructuredDecisionFetch
  /** Tests may avoid process-wide credential mutation; production reads the transport's key. */
  apiKey?: string
}

/**
 * Builds the C5 provider client only for an application that actually has remote work, on the
 * classifier row's transport. Shared billing first admits the spend, then invokes the caller's
 * durable receipt reservation immediately before the single physical request.
 */
export function createPostClassifierClient(
  input: {
    classifierRunId: string
    postId: string
    communityId: string | null
    /** The classifier row's transport and decision model. */
    selection: StructuredDecisionModelSelection
    beforeAttempt: PostClassifierProviderAttemptHook
  },
  options: PostClassifierClientOptions = {},
): StructuredDecisionClient {
  return createStructuredDecisionClient({
    transport: input.selection.provider,
    model: input.selection.model,
    apiKey: structuredDecisionApiKey(input.selection.provider, options.apiKey),
    fetch: options.fetch,
    hooks: createStructuredDecisionBillingHooks({
      workload: POST_CLASSIFIER_SLUG,
      classifierRunId: input.classifierRunId,
      postId: input.postId,
      communityId: input.communityId,
      beforeAttempt: input.beforeAttempt,
    }),
  })
}
