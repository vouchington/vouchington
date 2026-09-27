import { createStructuredDecisionBillingHooks } from '@agents/_shared'
import {
  createStructuredDecisionClient,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionClient,
  type StructuredDecisionFetch,
} from '@modules/structured-decisions'
import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'

type PostClassifierProviderAttemptHook = NonNullable<
  StructuredDecisionAttemptHooks['beforeAttempt']
>

type PostClassifierClientOptions = {
  /** The external-provider boundary is injectable only for deterministic tests. */
  fetch?: StructuredDecisionFetch
  /** Tests may avoid process-wide credential mutation; production uses OPENROUTER_API_KEY. */
  apiKey?: string
}

/**
 * Builds the C5 provider client only for an application that actually has remote work.
 *
 * This route is fixed to OpenRouter/Jev. Shared billing first admits the spend, then invokes the
 * caller's durable receipt reservation immediately before the single physical request.
 */
export function createPostClassifierOpenRouterClient(
  input: {
    postId: string
    communityId: string | null
    beforeAttempt: PostClassifierProviderAttemptHook
  },
  options: PostClassifierClientOptions = {},
): StructuredDecisionClient {
  return createStructuredDecisionClient({
    transport: 'openrouter',
    apiKey: options.apiKey ?? process.env.OPENROUTER_API_KEY ?? '',
    fetch: options.fetch,
    hooks: createStructuredDecisionBillingHooks({
      workload: POST_CLASSIFIER_SLUG,
      postId: input.postId,
      communityId: input.communityId,
      beforeAttempt: input.beforeAttempt,
    }),
  })
}
