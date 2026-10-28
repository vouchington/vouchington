import onError from '@modules/on-error'
import type { ModelUsage } from '@vouchington/ai/providers'
import { addAccumulatedTokens } from './token-accumulator.mts'
import {
  claimRegisteredResponseUsage,
  type BackgroundResponseRegistration,
  type ClassifierUsageAttribution,
} from './record-response-usage-ledger.mts'

export interface RecordModelUsageParams {
  agentSlug: string
  /** `anthropic`, `openai` or `typesafe`; the `ai_model_providers` finite set guards the column. */
  provider: string
  transport: string
  /** The model and service tier the provider actually served, not the requested ones. */
  model: string
  serviceTier: string
  usage: ModelUsage
  communityId?: string | null
  postId?: string | null
  // Set only inside a direct-OpenAI background-response scope. Unset for a foreground request that
  // never registers a response -- there is no saved response id to clear there, so recording falls
  // straight through to recordAiUsage.
  registration?: BackgroundResponseRegistration
  classifier?: ClassifierUsageAttribution
  // The request's start time, for a foreground request recorded after its request day (see
  // RecordAiUsageOptions.createdAt in @services/ai-usage/record.mts). Ignored when
  // `registration` is set: its own createdAt is the more authoritative request time.
  createdAt?: Date
}

export interface RecordModelUsageDeps {
  claimRegisteredResponseUsage: typeof claimRegisteredResponseUsage
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
 * A failed reporting write is logged without failing the already billed provider call.
 */
export async function recordModelUsage(
  { registration, createdAt, ...billed }: RecordModelUsageParams,
  deps: Partial<RecordModelUsageDeps> = {},
): Promise<void> {
  const claimUsage = deps.claimRegisteredResponseUsage ?? claimRegisteredResponseUsage
  const { usage } = billed

  addAccumulatedTokens(usage.inputTokens + usage.outputTokens)

  try {
    await claimUsage({ ...billed, registration, createdAt })
  } catch (err) {
    onError(err instanceof Error ? err : new Error('AI usage ledger write failed', { cause: err }))
  }
}
