import {
  assertDailySpendCapNotBreached,
  latchAccountingUncertainty,
  SpendCapBreachError,
} from '@services/ai-usage'
import { ModelProviderError } from '@modules/model-providers/errors'
import type {
  BilledModelResponse,
  ModelCallResult,
  ModelSelection,
  OpenAITransport,
} from '@modules/model-providers/types'
import { recordModelProviderAlarm } from '@modules/on-error'
import { getUtcDayFromDate } from '@ts-shared/utils/dates'
import {
  OpenAIResponseNotCompletedError,
  runWithBackgroundResponseHooks,
  runWithOpenAIResponseAttemptHooks,
} from './create-response.mts'
import { createOpenAIResponseAttemptHooks } from './openai-response-attempt-hooks.mts'
import { recordModelUsage } from './record-model-usage.mts'
import { createBackgroundResponseRegistrationHooks } from './record-response-background-hooks.mts'
import { recordAgentResponseUsage } from './record-response-usage.mts'

export interface CallRecordingModelUsageParams {
  /** The ledger `agent_slug`; also the service whose spend and alarms this call belongs to. */
  agentSlug: string
  selection: ModelSelection
  /** The global OpenAI transport the call will use; decides whether background mode applies. */
  openaiTransport: OpenAITransport
  communityId?: string | null
  postId?: string | null
  /** The classifier run whose agent made this call; its ledger row is attributed to the run. */
  classifierRunId?: string
  /**
   * Runs after the spend-cap check and immediately before the request is dispatched, so a caller
   * can reserve a durable provider attempt that a rejected admission never consumes.
   */
  beforeDispatch?: () => Promise<void>
}

type CallRecordingModelUsageDeps = {
  assertDailySpendCapNotBreached?: typeof assertDailySpendCapNotBreached
  latchAccountingUncertainty?: typeof latchAccountingUncertainty
  recordModelProviderAlarm?: typeof recordModelProviderAlarm
  recordModelUsage?: typeof recordModelUsage
}

/** Failures an operator must fix: a retry never helps, so each one raises an alarm. */
const ALARMED_CODES: ReadonlySet<string> = new Set([
  'client-unavailable',
  'credit-balance-too-low',
  'authentication',
  'permission',
])

/**
 * Runs one model call and settles its ledger row, whichever provider served it: a resolved result,
 * a billed 2xx answer that turned out unusable (a refusal, truncation or schema-invalid output,
 * which carry their billed response), and an OpenAI response that did not complete (which still
 * billed tokens).
 *
 * Rechecks the daily spend cap immediately before dispatching -- the shared recording/call boundary
 * every agent funnels through, closing the concurrent-admission gap between a job's pre-dispatch
 * check and its model call. Throws SpendCapBreachError, handled like the worker's own check. An
 * ambiguous failure after the request was sent (a timeout, a network failure) latches the request
 * day as an unknown billed attempt instead of being dropped. Direct OpenAI runs inside the
 * background-response scope, so a crash between "completed" and "recorded" leaves the row for the
 * sweeper. A failure that needs an operator (a missing credential, exhausted credits, a rejected
 * key) raises an alarm.
 */
export async function callRecordingModelUsage<T>(
  run: () => Promise<ModelCallResult<T>>,
  params: CallRecordingModelUsageParams,
  deps: CallRecordingModelUsageDeps = {},
): Promise<ModelCallResult<T>> {
  const { agentSlug, selection, openaiTransport, communityId, postId, classifierRunId } = params
  const checkSpendCap = deps.assertDailySpendCapNotBreached ?? assertDailySpendCapNotBreached
  const breach = await checkSpendCap(agentSlug)
  if (breach) throw new SpendCapBreachError(breach)
  await params.beforeDispatch?.()
  const requestStartedAt = new Date()
  const background =
    selection.provider === 'openai' && openaiTransport === 'direct'
      ? createBackgroundResponseRegistrationHooks({ agentSlug, communityId, postId })
      : undefined
  const attemptHooks = createOpenAIResponseAttemptHooks(agentSlug, deps)
  const record = (billed: BilledModelResponse) =>
    (deps.recordModelUsage ?? recordModelUsage)({
      agentSlug,
      communityId,
      postId,
      responseId: billed.responseId,
      provider: billed.provider,
      transport: billed.transport,
      model: billed.model,
      serviceTier: billed.serviceTier,
      usage: billed.usage,
      registration: background?.getRegistration(),
      createdAt: requestStartedAt,
      ...(classifierRunId
        ? {
            classifier: {
              runId: classifierRunId,
              latencyMs: Math.max(0, Date.now() - requestStartedAt.getTime()),
            },
          }
        : {}),
    })

  let result: ModelCallResult<T>
  try {
    result = await runWithOpenAIResponseAttemptHooks(attemptHooks, () =>
      background ? runWithBackgroundResponseHooks(background.hooks, run) : run(),
    )
  } catch (err) {
    if (err instanceof OpenAIResponseNotCompletedError) {
      await recordAgentResponseUsage({
        response: err,
        agentSlug,
        communityId,
        postId,
        transport: openaiTransport,
        registration: background?.getRegistration(),
        createdAt: requestStartedAt,
      })
    } else if (err instanceof ModelProviderError) {
      await settleProviderFailure(err, params, record, requestStartedAt, deps)
    }
    throw err
  }
  await record(result)
  return result
}

async function settleProviderFailure(
  err: ModelProviderError,
  { agentSlug, selection }: CallRecordingModelUsageParams,
  record: (billed: BilledModelResponse) => Promise<void>,
  requestStartedAt: Date,
  deps: CallRecordingModelUsageDeps,
): Promise<void> {
  if (err.billedResponse) await record(err.billedResponse)
  if (ALARMED_CODES.has(err.code)) {
    ;(deps.recordModelProviderAlarm ?? recordModelProviderAlarm)({
      kind:
        err.code === 'credit-balance-too-low' || err.code === 'client-unavailable'
          ? err.code
          : 'provider-rejected',
      service: agentSlug,
      provider: selection.provider,
      status: err.status,
    })
  }
  if (err.ambiguousBilled) {
    await (deps.latchAccountingUncertainty ?? latchAccountingUncertainty)({
      requestDay: getUtcDayFromDate(requestStartedAt),
      source: 'unknown_billed_attempt',
    })
  }
}
