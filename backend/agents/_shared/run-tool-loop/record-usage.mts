import {
  recordAgentResponseUsage,
  callRecordingAgentResponseUsage,
} from '../record-response-usage.mts'
import {
  OpenAIResponseNotCompletedError,
  type OpenAIResponse,
  type createOpenAIResponse,
} from '../create-response.mts'
import type { RunToolLoopConfig } from './types.mts'

type RecordToolLoopUsageParams = Pick<RunToolLoopConfig, 'agentSlug' | 'communityId' | 'postId'> & {
  // Pick, not the full OpenAIResponse: also accepts an OpenAIResponseNotCompletedError so a
  // failed/incomplete iteration's usage can be recorded from the thrown error.
  response: Pick<OpenAIResponse, 'usage' | 'model' | 'service_tier'> & { id?: string }
  // The streaming request's start time; see RecordAgentResponseUsageParams.createdAt for why this
  // exists. Unset callers (the plain, non-streaming tool loop) always have a background lease with
  // its own authoritative createdAt, so this stays optional.
  createdAt?: Date
}

type RecordToolLoopUsageDeps = {
  recordAgentResponseUsage?: typeof recordAgentResponseUsage
}

/**
 * Awaited cost-ledger settlement for one completed tool-loop OpenAI call. Delegates the actual
 * record-or-latch barrier to recordAgentResponseUsage — the same seam direct (non-loop) callers
 * use — so no later loop attempt starts while accounting remains unresolved.
 *
 * Silently no-ops when `agentSlug` is unset (aborted before an agentSlug-bearing config could
 * run, or a legacy config). `agentSlug` is optional on RunToolLoopConfig only so existing
 * unit-test fixtures don't all need updating; every real call site should set it.
 */
export async function recordToolLoopUsage(
  { agentSlug, communityId, postId, response, createdAt }: RecordToolLoopUsageParams,
  deps: RecordToolLoopUsageDeps = {},
): Promise<void> {
  if (!agentSlug) return
  const recordUsage = deps.recordAgentResponseUsage ?? recordAgentResponseUsage
  await recordUsage({ response, agentSlug, communityId, postId, createdAt })
}

type RecordToolLoopParams = Pick<RunToolLoopConfig, 'agentSlug' | 'communityId' | 'postId'> & {
  createdAt?: Date
}

/**
 * Records the ledger row for a thrown OpenAIResponseNotCompletedError — the request still billed
 * tokens even though it didn't complete. No-op for any other error. Shared by the plain tool loop
 * (via callRecordingToolLoopUsage below) and the two streaming variants, which can't use that
 * wrapper directly because they consume the response through a yield-driven generator rather than
 * a single awaited call.
 */
export async function recordToolLoopFailedUsage(
  error: unknown,
  params: RecordToolLoopParams,
  deps: RecordToolLoopUsageDeps = {},
): Promise<void> {
  if (error instanceof OpenAIResponseNotCompletedError) {
    await recordToolLoopUsage({ ...params, response: error }, deps)
  }
}

/**
 * Calls createResponse and records the ledger row for both outcomes, centralizing the
 * try/catch/record/rethrow shape shared by the tool loop's per-iteration and
 * max-iterations-fallback calls. Delegates to callRecordingAgentResponseUsage so the tool loop
 * shares the same background-response-registry compare-and-set as direct (non-loop) callers —
 * createOpenAIResponse always creates in the background internally (#8836), so every call here is
 * background-eligible and must claim its registration before recording.
 *
 * Takes createResponse and its args directly rather than a wrapping closure: the per-iteration
 * call site is inside runToolLoop's `while` loop, and a function expression there that captures
 * reassigned loop variables (previousResponseId, responseInput) is a no-loop-func lint violation.
 *
 * No-ops the registry/recording wrapper entirely when agentSlug is unset (legacy/test-only
 * fixtures — every real call site sets it), matching recordToolLoopUsage's existing no-op.
 */
export async function callRecordingToolLoopUsage(
  createResponse: typeof createOpenAIResponse,
  params: Parameters<typeof createOpenAIResponse>[0],
  options: Parameters<typeof createOpenAIResponse>[1],
  recordParams: RecordToolLoopParams,
  deps: RecordToolLoopUsageDeps = {},
): ReturnType<typeof createOpenAIResponse> {
  const { agentSlug, communityId, postId } = recordParams
  if (!agentSlug) return createResponse(params, options)

  return callRecordingAgentResponseUsage(
    () => createResponse(params, options),
    { agentSlug, communityId, postId },
    deps,
  )
}
