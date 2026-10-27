import onError from '@modules/on-error'
import {
  hasRecordedAiUsageResponseId,
  latchAccountingUncertainty,
  recordAiUsage,
} from '@services/ai-usage'
import { getUtcDayFromDate } from '@ts-shared/utils/dates'
import {
  isOpenAIResponseNotCompletedError,
  isOpenAINotFoundError,
  validateCompletedResponse,
} from '@vouchington/ai/openai'
import { retrieveOpenAIResponse, cancelOpenAIResponse } from '@modules/openai-utils/create-response'
import { openAIUsageToModelUsage, type OpenAIUsageLike } from '@vouchington/ai/providers'
import type { BackgroundResponseToReconcile } from './types.mts'

export type ReconcileBackgroundResponseResult =
  | 'still-active'
  | 'expired'
  | 'recorded'
  | 'already-recorded'
  | 'accounting-uncertain'
  | 'no-usage'
  | 'terminal-no-usage'

/** Reconciles an AI job's persisted response id. */
export async function reconcileBackgroundResponse(
  candidate: BackgroundResponseToReconcile,
  mode: 'worker' | 'inline' = 'worker',
): Promise<ReconcileBackgroundResponseResult> {
  if (await hasRecordedAiUsageResponseId(candidate.responseId)) {
    return 'already-recorded'
  }

  let raw: Awaited<ReturnType<typeof retrieveOpenAIResponse>>
  try {
    raw = await retrieveOpenAIResponse(candidate.responseId)
  } catch (err) {
    if (!isOpenAINotFoundError(err)) throw err
    await latchAccountingUncertainty({
      requestDay: getUtcDayFromDate(candidate.createdAt),
      source: 'unknown_billed_attempt',
    })
    onError(
      new Error(`Background OpenAI response passed retrieval retention: ${candidate.responseId}`, {
        cause: err,
      }),
    )
    return 'expired'
  }

  let usage: OpenAIUsageLike | undefined
  let model: string | undefined
  let serviceTier: string | undefined
  try {
    const completed = validateCompletedResponse(raw)
    usage = completed.usage ?? undefined
    model = completed.model
    serviceTier = completed.service_tier ?? undefined
    if (!usage) {
      // A completed call was billed, but without usage its cost is unknown.
      await latchAccountingUncertainty({
        requestDay: getUtcDayFromDate(candidate.createdAt),
        source: 'unknown_billed_attempt',
      })
      return 'no-usage'
    }
  } catch (err) {
    if (!isOpenAIResponseNotCompletedError(err)) throw err
    if (err.status !== 'failed' && err.status !== 'incomplete' && err.status !== 'cancelled') {
      // A worker replay must settle a live paid call before it can dispatch another. An inline
      // recovery job only observes its original call, which may still be serving the requester.
      if (mode === 'worker') await cancelOpenAIResponse(candidate.responseId)
      return 'still-active'
    }
    if (!err.usage) {
      // Provider usage can lag a terminal state. Policy settles this ID with unknown billed
      // usage and latches uncertainty instead of retaining it indefinitely.
      await latchAccountingUncertainty({
        requestDay: getUtcDayFromDate(candidate.createdAt),
        source: 'unknown_billed_attempt',
      })
      return 'terminal-no-usage'
    }
    usage = err.usage
    model = err.model
    serviceTier = err.service_tier ?? undefined
  }

  if (!usage) throw new Error(`Terminal OpenAI response has no usage: ${candidate.responseId}`)
  try {
    const options = {
      responseId: candidate.responseId,
      agentSlug: candidate.agentSlug,
      communityId: candidate.communityId,
      postId: candidate.postId,
      provider: 'openai' as const,
      transport: 'direct' as const,
      model: model ?? 'unknown-model',
      serviceTier: serviceTier ?? 'unknown-tier',
      usage: openAIUsageToModelUsage(usage),
      createdAt: candidate.createdAt,
    }
    await recordAiUsage({ ...options, resolveLiveScopeOnInsert: true })
    return 'recorded'
  } catch (err) {
    onError(
      err instanceof Error
        ? err
        : new Error('Background OpenAI usage ledger write failed', { cause: err }),
    )
    await latchAccountingUncertainty({
      requestDay: getUtcDayFromDate(candidate.createdAt),
      source: 'ledger_write_failed',
    })
    return 'accounting-uncertain'
  }
}
