import { callRecordingAgentResponseUsage } from '../record-response-usage.mts'
import type { createOpenAIResponse } from '../create-response.mts'
import type { RunToolLoopConfig } from './types.mts'

type RecordToolLoopUsageDeps = NonNullable<Parameters<typeof callRecordingAgentResponseUsage>[2]>

type RecordToolLoopParams = Pick<
  RunToolLoopConfig,
  'agentSlug' | 'communityId' | 'postId' | 'responseProvider'
>

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
 * fixtures — every real call site sets it). `agentSlug` is optional on RunToolLoopConfig only so
 * existing unit-test fixtures don't all need updating.
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
    { agentSlug, communityId, postId, responseProvider: recordParams.responseProvider },
    deps,
  )
}
