import type { Response } from 'openai/resources/responses/responses'
import { APIError } from 'openai'
import onError from '@modules/on-error'
import { latchAccountingUncertainty } from '@services/ai-usage'
import { getUtcDayFromDate } from '@ts-shared/utils/dates'
import {
  retrieveOpenAIResponse,
  cancelOpenAIResponse,
  validateCompletedResponse,
  OpenAIResponseNotCompletedError,
} from '@modules/openai-utils/create-response'
import { claimExpiredBackgroundResponse, deleteBackgroundResponseRegistration } from './claim.mts'
import { claimAndRecordBackgroundResponseUsage } from './claim-and-record.mts'
import type { ExpiredBackgroundResponse } from './expired.mts'

type ReconcileDependencies = {
  claimAndRecordBackgroundResponseUsage: typeof claimAndRecordBackgroundResponseUsage
  latchAccountingUncertainty: typeof latchAccountingUncertainty
}

const defaultDependencies: ReconcileDependencies = {
  claimAndRecordBackgroundResponseUsage,
  latchAccountingUncertainty,
}

export type ReconcileBackgroundResponseResult =
  // Left registered for a later pass: either still generating server-side and now cancelled, or
  // terminal but waiting for usage to settle.
  | 'still-active'
  // Terminal, but another caller's compare-and-set (the normal-completion path, or an earlier
  // sweep pass) already claimed and recorded it first.
  | 'lost-race'
  // Past OpenAI's retention window -- retrieve() 404s. Deleted; nothing to record.
  | 'expired'
  // Claimed and written to ai_usage_records.
  | 'recorded'
  | 'already-recorded'
  // Ledger persistence failed, but the response's request day is now durably fail-closed.
  | 'accounting-uncertain'
  // Completed without billable usage; exact-token cleanup removed the durable lease.
  | 'no-usage'

/**
 * Reconciles one expired openai_background_responses lease (#8836): a response registered by
 * drainBackgroundOpenAIResponse (backend/modules/openai-utils/create-response.mts) whose original
 * caller never claimed it -- a crash or rolling deploy killed the process before it could
 * cancel/record/delete, or an abort's cancel() call already ran but usage hadn't settled yet (the
 * ~10s cancel()-to-usage lag documented in the background-mode spike, written up in the private
 * vouchington/vouchington-docs repository).
 */
export async function reconcileExpiredBackgroundResponse(
  candidate: ExpiredBackgroundResponse,
  deps: Partial<ReconcileDependencies> = {},
): Promise<ReconcileBackgroundResponseResult> {
  const dependencies = { ...defaultDependencies, ...deps }
  const row = await claimExpiredBackgroundResponse(candidate)
  if (!row) return 'lost-race'

  let raw: Response
  try {
    raw = await retrieveOpenAIResponse(row.responseId)
  } catch (err) {
    if (err instanceof APIError && err.status === 404) {
      const deleted = await deleteBackgroundResponseRegistration(row.responseId, row.leaseToken)
      if (!deleted) return 'lost-race'
      onError(
        new Error(
          `openai_background_responses row past OpenAI's retrieve() retention window: ${row.responseId}`,
          { cause: err },
        ),
      )
      return 'expired'
    }
    throw err
  }

  try {
    const completed = validateCompletedResponse(raw)
    if (!completed.usage) {
      return (await deleteBackgroundResponseRegistration(row.responseId, row.leaseToken))
        ? 'no-usage'
        : 'lost-race'
    }
    return await claimAndRecordWithUncertainty(
      {
        responseId: row.responseId,
        leaseToken: row.leaseToken,
        agentSlug: row.agentSlug,
        communityId: row.communityId,
        postId: row.postId,
        usage: completed.usage,
        model: completed.model,
        serviceTier: completed.service_tier ?? 'unknown-tier',
        createdAt: row.createdAt,
      },
      dependencies,
    )
  } catch (err) {
    if (!(err instanceof OpenAIResponseNotCompletedError)) throw err
    if (err.status !== 'failed' && err.status !== 'incomplete' && err.status !== 'cancelled') {
      await cancelOpenAIResponse(row.responseId)
      return 'still-active'
    }
    // Terminal usage can lag cancellation. Keep the sweeper-owned row until its short lease
    // expires so a later pass can retrieve the settled usage instead of deleting it prematurely.
    if (!err.usage) return 'still-active'
    return claimAndRecordWithUncertainty(
      {
        responseId: row.responseId,
        leaseToken: row.leaseToken,
        agentSlug: row.agentSlug,
        communityId: row.communityId,
        postId: row.postId,
        usage: err.usage,
        model: err.model,
        serviceTier: err.service_tier ?? 'unknown-tier',
        createdAt: row.createdAt,
      },
      dependencies,
    )
  }
}

async function claimAndRecordWithUncertainty(
  params: Parameters<typeof claimAndRecordBackgroundResponseUsage>[0],
  dependencies: ReconcileDependencies,
): Promise<ReconcileBackgroundResponseResult> {
  try {
    return await dependencies.claimAndRecordBackgroundResponseUsage(params)
  } catch (err) {
    onError(
      err instanceof Error
        ? err
        : new Error('Background OpenAI usage ledger write failed', { cause: err }),
    )
    await dependencies.latchAccountingUncertainty({
      requestDay: getUtcDayFromDate(params.createdAt),
      source: 'ledger_write_failed',
    })
    return 'accounting-uncertain'
  }
}
