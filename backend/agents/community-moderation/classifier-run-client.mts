import { createStructuredDecisionBillingHooks } from '@agents/_shared'
import {
  createStructuredDecisionClient,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionClient,
  type StructuredDecisionFetch,
} from '@modules/structured-decisions'
import type { ClassifierModelProvider } from '@voucha/types'
import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'

type CommunityModerationAttemptHook = NonNullable<StructuredDecisionAttemptHooks['beforeAttempt']>

type CommunityModerationClientOptions = {
  /** The external-provider boundary is injectable only for deterministic tests. */
  fetch?: StructuredDecisionFetch
  /** Tests may avoid process-wide credential mutation; production uses OPENROUTER_API_KEY. */
  apiKey?: string
}

/**
 * The seeded `community-moderation` classifier is always `openrouter`. An operator reconfiguring
 * it to another provider gets no key source, so building the client throws and the run ends
 * through the shared client-unavailable path instead of spending or looping.
 */
function resolveApiKey(
  provider: ClassifierModelProvider,
  options: CommunityModerationClientOptions,
): string {
  if (provider !== 'openrouter') {
    throw new Error(
      `Community moderation classifier has no API key source for provider '${provider}'`,
    )
  }
  return options.apiKey ?? process.env.OPENROUTER_API_KEY ?? ''
}

/**
 * Builds the C8 provider client only for a run that has remote work. Shared billing first admits
 * the spend, then the lifecycle's durable attempt reservation runs immediately before the single
 * physical request, so provider spend per run is capped at the reserved attempts and persisted
 * outcomes short-circuit any replay.
 */
export function createCommunityModerationClient(
  input: {
    postId: string | null
    communityId: string
    modelProvider: ClassifierModelProvider
    beforeAttempt: CommunityModerationAttemptHook
  },
  options: CommunityModerationClientOptions = {},
): StructuredDecisionClient {
  return createStructuredDecisionClient({
    transport: input.modelProvider,
    apiKey: resolveApiKey(input.modelProvider, options),
    fetch: options.fetch,
    hooks: createStructuredDecisionBillingHooks({
      workload: COMMUNITY_MODERATION_CLASSIFIER_SLUG,
      postId: input.postId,
      communityId: input.communityId,
      beforeAttempt: input.beforeAttempt,
    }),
  })
}
