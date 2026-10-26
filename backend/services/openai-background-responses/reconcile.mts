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
import { deleteBackgroundResponseRegistration } from './claim.mts'
import { recordAndDeleteBackgroundResponseUsage } from './claim-and-record.mts'
import type { BackgroundResponseToReconcile } from './expired.mts'

export type ReconcileBackgroundResponseResult =
  | 'still-active'
  | 'expired'
  | 'recorded'
  | 'already-recorded'
  | 'accounting-uncertain'
  | 'no-usage'

/** Reconciles either a retained inline registration or an AI job's persisted response id. */
export async function reconcileBackgroundResponse(
  candidate: BackgroundResponseToReconcile,
  owner: 'table' | 'job',
): Promise<ReconcileBackgroundResponseResult> {
  if (await hasRecordedAiUsageResponseId(candidate.responseId)) {
    if (owner === 'table') await deleteBackgroundResponseRegistration(candidate.responseId)
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
    if (owner === 'table') await deleteBackgroundResponseRegistration(candidate.responseId)
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
      if (owner === 'table') await deleteBackgroundResponseRegistration(candidate.responseId)
      return 'no-usage'
    }
  } catch (err) {
    if (!isOpenAIResponseNotCompletedError(err)) throw err
    if (err.status !== 'failed' && err.status !== 'incomplete' && err.status !== 'cancelled') {
      await cancelOpenAIResponse(candidate.responseId)
      return 'still-active'
    }
    if (!err.usage) return 'still-active'
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
    if (owner === 'table') await recordAndDeleteBackgroundResponseUsage(options)
    else await recordAiUsage({ ...options, resolveLiveScopeOnInsert: true })
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

export function reconcileAgedBackgroundResponse(
  candidate: BackgroundResponseToReconcile,
): Promise<ReconcileBackgroundResponseResult> {
  return reconcileBackgroundResponse(candidate, 'table')
}
