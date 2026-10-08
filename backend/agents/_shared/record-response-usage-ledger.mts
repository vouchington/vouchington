import { hasRecordedAiUsageResponseId, recordAiUsage } from '@services/ai-usage'
import {
  claimAndRecordBackgroundResponseUsage,
  type OwnedBackgroundResponseLease,
} from '@services/openai-background-responses'
import type {
  LedgerModelProvider,
  ModelUsage,
  ProviderTransport,
} from '@modules/model-providers/types'

export interface BackgroundResponseRegistration {
  responseId: string
  lease: OwnedBackgroundResponseLease | undefined
}

/** Which classifier run's provider attempt made a call, and how long the response took. */
export interface ClassifierUsageAttribution {
  runId: string
  latencyMs: number
}

interface ClaimRegisteredResponseUsageParams {
  responseId?: string
  provider: LedgerModelProvider
  transport: ProviderTransport
  usage: ModelUsage
  model: string
  serviceTier: string
  agentSlug: string
  communityId?: string | null
  postId?: string | null
  registration?: BackgroundResponseRegistration
  /** Set only by classifier clients, which never register a background response. */
  classifier?: ClassifierUsageAttribution
  createdAt?: Date
}

/**
 * Writes the ai_usage_records ledger row. A registered response must first finalize its exact
 * fencing token; response-id idempotency then makes ambiguous and concurrent accounting retries
 * converge on one ledger row. A `lost-race` result is settled only when that fence already exists;
 * otherwise this throws so the caller can latch the request day before another provider attempt.
 */
export async function claimRegisteredResponseUsage({
  registration,
  responseId,
  createdAt,
  classifier,
  ...usage
}: ClaimRegisteredResponseUsageParams): Promise<void> {
  if (!registration?.lease) {
    await recordAiUsage({
      responseId,
      createdAt,
      classifierRunId: classifier?.runId,
      latencyMs: classifier?.latencyMs,
      ...usage,
    })
    return
  }

  // The registry exists only for direct OpenAI background responses, so `provider` and
  // `transport` (always 'openai' and 'direct' there) are fixed by the claim itself.
  const result = await claimAndRecordBackgroundResponseUsage({
    responseId: registration.responseId,
    leaseToken: registration.lease.leaseToken,
    createdAt: registration.lease.createdAt,
    agentSlug: usage.agentSlug,
    communityId: usage.communityId,
    postId: usage.postId,
    usage: usage.usage,
    model: usage.model,
    serviceTier: usage.serviceTier,
  })
  if (result !== 'lost-race') return
  if (await hasRecordedAiUsageResponseId(registration.responseId)) return
  throw new Error(
    `Background response usage is still unsettled after losing the lease: ${registration.responseId}`,
  )
}
