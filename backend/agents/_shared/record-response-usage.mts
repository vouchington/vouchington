import {
  assertOpenAiSpendCapNotBreached,
  latchAccountingUncertainty,
  OpenAiSpendCapBreachError,
} from '@services/ai-usage'
import onError from '@modules/on-error'
import { createBackgroundResponseRegistrationHooks } from './record-response-background-hooks.mts'
import {
  OpenAIResponseNotCompletedError,
  runWithBackgroundResponseHooks,
  runWithOpenAIResponseAttemptHooks,
  type OpenAIResponse,
} from './create-response.mts'
import { createOpenAIResponseAttemptHooks } from './openai-response-attempt-hooks.mts'
import { addAccumulatedTokens } from './token-accumulator.mts'
import { getUtcDayFromDate } from '@ts-shared/utils/dates'
import {
  claimRegisteredResponseUsage,
  type BackgroundResponseRegistration,
} from './record-response-usage-ledger.mts'
import { isStorableResponseId } from './response-id-storage-key.mts'

interface RecordAgentResponseUsageParams {
  // Pick, not the full OpenAIResponse: this also accepts an OpenAIResponseNotCompletedError
  // (failed/incomplete responses still bill tokens, and carry the same three fields), so callers
  // can record from the thrown error without a completed response ever existing.
  response: Pick<OpenAIResponse, 'usage' | 'model' | 'service_tier'> & { id?: string }
  agentSlug: string
  communityId?: string | null
  postId?: string | null
  // Set only inside callRecordingAgentResponseUsage's background-response-hooks scope. Unset for
  // the streaming tool loop (run-tool-loop-streaming*.mts), which stays foreground (#8836) and
  // never registers a response -- there is no sweeper race to guard there, so recording falls
  // straight through to recordAiUsage.
  registration?: BackgroundResponseRegistration
  // The streaming request's start time, for a foreground stream recorded after its request day
  // (see RecordAiUsageOptions.createdAt in @services/ai-usage/record.mts). Ignored when
  // `registration.lease` is set -- the lease's own createdAt is the more authoritative request
  // time there.
  createdAt?: Date
}

interface RecordAgentResponseUsageDeps {
  claimRegisteredResponseUsage: typeof claimRegisteredResponseUsage
  latchAccountingUncertainty: typeof latchAccountingUncertainty
}

/**
 * Settles cost-ledger recording for a single completed OpenAI call. Shared by
 * callRecordingAgentResponseUsage (below) and run-tool-loop/record-usage.mts's
 * recordToolLoopUsage, so direct calls, the tool loop, and the streaming tool loop all share one
 * recording policy.
 *
 * Records from `response.model`/`response.service_tier` — what OpenAI actually served — not the
 * requested model/tier, falling back to a distinguishable sentinel when either is missing so a
 * systematic mismatch is visible rather than silently priced wrong.
 *
 * Silently no-ops when the response carried no `usage` (e.g. a test double that doesn't model
 * the real API shape).
 *
 * Also feeds token-accumulator.mts's per-job accumulator, if a runWithJobTokenAccumulator scope
 * is active (processAIAgentWorkerJob, backend/workers/ai-agents/workers/core.mts) -- this is what
 * makes glide-mq's tokenLimiter see real TPM consumption instead of staying permanently at zero.
 */
export async function recordAgentResponseUsage(
  {
    response,
    agentSlug,
    communityId,
    postId,
    registration,
    createdAt,
  }: RecordAgentResponseUsageParams,
  deps: Partial<RecordAgentResponseUsageDeps> = {},
): Promise<void> {
  if (!response.usage) return
  const claimUsage = deps.claimRegisteredResponseUsage ?? claimRegisteredResponseUsage
  const latchUncertainty = deps.latchAccountingUncertainty ?? latchAccountingUncertainty

  addAccumulatedTokens((response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0))
  const registrationId = registration?.responseId
  const responseId = isStorableResponseId(response.id)
    ? response.id
    : isStorableResponseId(registrationId)
      ? registrationId
      : undefined
  const hasInvalidId =
    (response.id !== undefined && !isStorableResponseId(response.id)) ||
    (registrationId !== undefined && !isStorableResponseId(registrationId))
  if (hasInvalidId) {
    onError(new Error(`OpenAI usage has an unusable response id: ${agentSlug}`))
  } else if (responseId === undefined) {
    onError(new Error(`OpenAI usage cannot be made idempotent without a response id: ${agentSlug}`))
  }

  try {
    await claimUsage({
      responseId,
      usage: response.usage,
      model: response.model ?? 'unknown-model',
      serviceTier: response.service_tier ?? 'unknown-tier',
      agentSlug,
      communityId,
      postId,
      registration,
      createdAt,
    })
  } catch (error) {
    onError(
      error instanceof Error
        ? error
        : new Error('OpenAI usage ledger write failed', { cause: error }),
    )
    const requestDay = getUtcDayFromDate(registration?.lease?.createdAt ?? createdAt ?? new Date())
    await latchUncertainty({ requestDay, source: 'ledger_write_failed' })
  }
}

type CallRecordingAgentResponseUsageParams = Omit<
  RecordAgentResponseUsageParams,
  'response' | 'registration'
> & {
  /** OpenRouter has no compatible retrieve/cancel lifecycle, so it settles foreground usage directly. */
  responseProvider?: 'openai' | 'openrouter'
}

/**
 * Calls fn and records the ledger row for a resolved response or a thrown
 * OpenAIResponseNotCompletedError (which still billed tokens). Centralizes the
 * try/catch/record/rethrow shape every direct (non-tool-loop) OpenAI call site duplicated.
 *
 * fn runs inside a background-response-hooks scope
 * (backend/modules/openai-utils/background-response-context.mts): createOpenAIResponse always
 * creates in the background internally (#8836), so as soon as its response id is known it is
 * registered in openai_background_responses. recordAgentResponseUsage claims that registration
 * before writing to ai_usage_records, so a crash between "response completed" and "row recorded"
 * leaves the row for the sweeper reconciler to pick up instead of losing the usage. On an abort
 * (an error that is not OpenAIResponseNotCompletedError), this deliberately does not touch the
 * registration at all -- drainBackgroundOpenAIResponse has already cancelled the response, and
 * the sweeper is the one that records it once cancellation's usage settles.
 *
 * fn stays unconstrained because several callers inject `Promise<unknown>` test doubles. The real
 * implementation returns OpenAIResponse; the cast below keeps that knowledge in one place.
 *
 * Rechecks the daily OpenAI spend cap immediately before dispatching fn, mirroring
 * run-tool-loop/spend-cap-check.mts's assertSpendCapNotBreachedForIteration -- this is the shared
 * recording/call boundary every direct (non-tool-loop) agent call site funnels through, closing the
 * concurrent-admission gap between a job's pre-dispatch check and its actual model call. Throws
 * OpenAiSpendCapBreachError, caught the same way as processAIAgentWorkerJob's pre-dispatch check.
 */
export async function callRecordingAgentResponseUsage<T>(
  fn: () => Promise<T>,
  params: CallRecordingAgentResponseUsageParams,
  deps: {
    assertOpenAiSpendCapNotBreached?: typeof assertOpenAiSpendCapNotBreached
    latchAccountingUncertainty?: typeof latchAccountingUncertainty
    recordAgentResponseUsage?: typeof recordAgentResponseUsage
  } = {},
): Promise<T> {
  const checkSpendCap = deps.assertOpenAiSpendCapNotBreached ?? assertOpenAiSpendCapNotBreached
  const recordUsage = deps.recordAgentResponseUsage ?? recordAgentResponseUsage
  const breach = await checkSpendCap(params.agentSlug)
  if (breach) throw new OpenAiSpendCapBreachError(breach)
  const requestStartedAt = new Date()
  const attemptHooks = createOpenAIResponseAttemptHooks(params.agentSlug, deps)

  const background =
    params.responseProvider === 'openrouter'
      ? undefined
      : createBackgroundResponseRegistrationHooks(params)

  let response: T
  try {
    response = await runWithOpenAIResponseAttemptHooks(attemptHooks, () =>
      background ? runWithBackgroundResponseHooks(background.hooks, fn) : fn(),
    )
  } catch (error) {
    if (error instanceof OpenAIResponseNotCompletedError) {
      await recordUsage({
        response: error,
        ...params,
        registration: background?.getRegistration(),
        createdAt: requestStartedAt,
      })
    }
    throw error
  }
  await recordUsage({
    response: response as OpenAIResponse,
    ...params,
    registration: background?.getRegistration(),
    createdAt: requestStartedAt,
  })
  return response
}
