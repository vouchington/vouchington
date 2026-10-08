import { latchAccountingUncertainty } from '@services/ai-usage'
import onError from '@modules/on-error'
import type {
  LedgerModelProvider,
  ModelUsage,
  ProviderTransport,
} from '@modules/model-providers/types'
import { getUtcDayFromDate } from '@ts-shared/utils/dates'
import { addAccumulatedTokens } from './token-accumulator.mts'
import {
  claimRegisteredResponseUsage,
  type BackgroundResponseRegistration,
  type ClassifierUsageAttribution,
} from './record-response-usage-ledger.mts'
import { isStorableResponseId } from './response-id-storage-key.mts'

export interface RecordModelUsageParams {
  /** The provider response id; the ledger's idempotency key. */
  responseId?: string
  agentSlug: string
  provider: LedgerModelProvider
  transport: ProviderTransport
  /** The model and service tier the provider actually served, not the requested ones. */
  model: string
  serviceTier: string
  usage: ModelUsage
  communityId?: string | null
  postId?: string | null
  // Set only inside a direct-OpenAI background-response scope. Unset for a foreground request that
  // never registers a response -- there is no sweeper race to guard there, so recording falls
  // straight through to recordAiUsage.
  registration?: BackgroundResponseRegistration
  classifier?: ClassifierUsageAttribution
  // The request's start time, for a foreground request recorded after its request day (see
  // RecordAiUsageOptions.createdAt in @services/ai-usage/record.mts). Ignored when
  // `registration.lease` is set: the lease's own createdAt is the more authoritative request time.
  createdAt?: Date
}

export interface RecordModelUsageDeps {
  claimRegisteredResponseUsage: typeof claimRegisteredResponseUsage
  latchAccountingUncertainty: typeof latchAccountingUncertainty
}

/**
 * Settles cost-ledger recording for one billed provider call, whichever provider served it. Every
 * agent call site reaches it (through `callRecordingModelUsage`, or `recordAgentResponseUsage` for
 * the jev classifiers), so they share one recording policy.
 *
 * It also feeds token-accumulator.mts's per-job accumulator, if a runWithJobTokenAccumulator scope
 * is active (processAIAgentWorkerJob, backend/workers/ai-agents/workers/core.mts) -- this is what
 * makes glide-mq's tokenLimiter see real TPM consumption instead of staying permanently at zero.
 *
 * A ledger write that fails must durably latch the request day as accounting-uncertain before
 * control can advance; if both writes fail, the caller fails closed.
 */
export async function recordModelUsage(
  { responseId: reportedId, registration, createdAt, ...billed }: RecordModelUsageParams,
  deps: Partial<RecordModelUsageDeps> = {},
): Promise<void> {
  const claimUsage = deps.claimRegisteredResponseUsage ?? claimRegisteredResponseUsage
  const latchUncertainty = deps.latchAccountingUncertainty ?? latchAccountingUncertainty
  const { agentSlug, usage } = billed

  addAccumulatedTokens(usage.inputTokens + usage.outputTokens)
  const registrationId = registration?.responseId
  const responseId = isStorableResponseId(reportedId)
    ? reportedId
    : isStorableResponseId(registrationId)
      ? registrationId
      : undefined
  const hasInvalidId =
    (reportedId !== undefined && !isStorableResponseId(reportedId)) ||
    (registrationId !== undefined && !isStorableResponseId(registrationId))
  if (hasInvalidId) {
    onError(new Error(`AI usage has an unusable response id: ${agentSlug}`))
  } else if (responseId === undefined) {
    onError(new Error(`AI usage cannot be made idempotent without a response id: ${agentSlug}`))
  }

  try {
    await claimUsage({ ...billed, responseId, registration, createdAt })
  } catch (err) {
    onError(err instanceof Error ? err : new Error('AI usage ledger write failed', { cause: err }))
    const requestDay = getUtcDayFromDate(registration?.lease?.createdAt ?? createdAt ?? new Date())
    await latchUncertainty({ requestDay, source: 'ledger_write_failed' })
  }
}
