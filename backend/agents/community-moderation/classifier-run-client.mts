import { createStructuredDecisionBillingHooks } from '@agents/_shared'
import {
  createStructuredDecisionClient,
  structuredDecisionApiKey,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionClient,
  type StructuredDecisionFetch,
  type StructuredDecisionModelSelection,
} from '@modules/structured-decisions'
import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'

type CommunityModerationAttemptHook = NonNullable<StructuredDecisionAttemptHooks['beforeAttempt']>

type CommunityModerationClientOptions = {
  /** The external-provider boundary is injectable only for deterministic tests. */
  fetch?: StructuredDecisionFetch
  /** Tests may avoid process-wide credential mutation; production reads the transport's key. */
  apiKey?: string
}

/**
 * Builds the C8 provider client only for a run that has remote work. Shared billing first admits
 * the spend, then the lifecycle's durable attempt reservation runs immediately before the single
 * physical request, so provider spend per run is capped at the reserved attempts and persisted
 * outcomes short-circuit any replay.
 */
export function createCommunityModerationClient(
  input: {
    classifierRunId: string
    postId: string | null
    communityId: string
    selection: StructuredDecisionModelSelection
    beforeAttempt: CommunityModerationAttemptHook
  },
  options: CommunityModerationClientOptions = {},
): StructuredDecisionClient {
  return createStructuredDecisionClient({
    transport: input.selection.provider,
    model: input.selection.model,
    apiKey: structuredDecisionApiKey(input.selection.provider, options.apiKey),
    fetch: options.fetch,
    hooks: createStructuredDecisionBillingHooks({
      workload: COMMUNITY_MODERATION_CLASSIFIER_SLUG,
      classifierRunId: input.classifierRunId,
      postId: input.postId,
      communityId: input.communityId,
      beforeAttempt: input.beforeAttempt,
    }),
  })
}
