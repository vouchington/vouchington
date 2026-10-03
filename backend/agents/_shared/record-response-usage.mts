import {
  assertDailySpendCapNotBreached,
  latchAccountingUncertainty,
  SpendCapBreachError,
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
  type ClassifierUsageAttribution,
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
  // a foreground request that never registers a response -- there is no sweeper race to guard
  // there, so recording falls straight through to recordAiUsage.
  registration?: BackgroundResponseRegistration
  classifier?: ClassifierUsageAttribution
  // The request's start time, for a foreground request recorded after its request day
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
 * Settles cost-ledger recording for a single completed provider call. Shared by
 * callRecordingAgentResponseUsage (below), which every agent call site goes through, so they
 * share one recording policy.
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
    classifier,
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
    onError(new Error(`AI usage has an unusable response id: ${agentSlug}`))
  } else if (responseId === undefined) {
    onError(new Error(`AI usage cannot be made idempotent without a response id: ${agentSlug}`))
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
      classifier,
      createdAt,
    })
  } catch (err) {
    onError(err instanceof Error ? err : new Error('AI usage ledger write failed', { cause: err }))
    const requestDay = getUtcDayFromDate(registration?.lease?.createdAt ?? createdAt ?? new Date())
    await latchUncertainty({ requestDay, source: 'ledger_write_failed' })
  }
}

type CallRecordingAgentResponseUsageParams = Omit<
  RecordAgentResponseUsageParams,
  'response' | 'registration' | 'classifier'
> & {
  /** OpenRouter has no compatible retrieve/cancel lifecycle, so it settles foreground usage directly. */
  responseProvider?: 'openai' | 'openrouter'
}

/**
 * Calls fn and records the ledger row for a resolved response or a thrown
 * OpenAIResponseNotCompletedError (which still billed tokens). Centralizes the
 * try/catch/record/rethrow shape every agent call site duplicated.
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
 * Rechecks the daily AI spend cap immediately before dispatching fn -- this is the shared
 * recording/call boundary every agent call site funnels through, closing the concurrent-admission
 * gap between a job's pre-dispatch check and its actual model call. Throws SpendCapBreachError,
 * caught the same way as processAIAgentWorkerJob's pre-dispatch check.
 */
export async function callRecordingAgentResponseUsage<T>(
  fn: () => Promise<T>,
  params: CallRecordingAgentResponseUsageParams,
  deps: {
    assertDailySpendCapNotBreached?: typeof assertDailySpendCapNotBreached
    latchAccountingUncertainty?: typeof latchAccountingUncertainty
    recordAgentResponseUsage?: typeof recordAgentResponseUsage
  } = {},
): Promise<T> {
  const checkSpendCap = deps.assertDailySpendCapNotBreached ?? assertDailySpendCapNotBreached
  const recordUsage = deps.recordAgentResponseUsage ?? recordAgentResponseUsage
  const breach = await checkSpendCap(params.agentSlug)
  if (breach) throw new SpendCapBreachError(breach)
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
  } catch (err) {
    if (err instanceof OpenAIResponseNotCompletedError) {
      await recordUsage({
        response: err,
        ...params,
        registration: background?.getRegistration(),
        createdAt: requestStartedAt,
      })
    }
    throw err
  }
  await recordUsage({
    response: response as OpenAIResponse,
    ...params,
    registration: background?.getRegistration(),
    createdAt: requestStartedAt,
  })
  return response
}
