import { hasRecordedAiUsageResponseId, recordAiUsage } from '@services/ai-usage'
import {
  claimAndRecordBackgroundResponseUsage,
  type OwnedBackgroundResponseLease,
} from '@services/openai-background-responses'
import type { OpenAIUsage } from './create-response.mts'

export interface BackgroundResponseRegistration {
  responseId: string
  lease: OwnedBackgroundResponseLease | undefined
}

interface ClaimRegisteredResponseUsageParams {
  responseId?: string
  usage: OpenAIUsage
  model: string
  serviceTier: string
  agentSlug: string
  communityId?: string | null
  postId?: string | null
  registration?: BackgroundResponseRegistration
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
  ...usage
}: ClaimRegisteredResponseUsageParams): Promise<void> {
  if (!registration?.lease) {
    await recordAiUsage({ responseId, createdAt, ...usage })
    return
  }

  const result = await claimAndRecordBackgroundResponseUsage({
    responseId: registration.responseId,
    leaseToken: registration.lease.leaseToken,
    createdAt: registration.lease.createdAt,
    ...usage,
  })
  if (result !== 'lost-race') return
  if (await hasRecordedAiUsageResponseId(registration.responseId)) return
  throw new Error(
    `Background response usage is still unsettled after losing the lease: ${registration.responseId}`,
  )
}
