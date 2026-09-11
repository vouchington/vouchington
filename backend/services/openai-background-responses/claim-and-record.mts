import { beginTransaction } from '@data-stores/psql'
import type { OpenAIUsage } from '@modules/openai-utils/create-response'
import { recordAiUsage } from '@services/ai-usage'
import { deleteBackgroundResponseRegistration } from './claim.mts'

export type ClaimAndRecordUsageResult =
  // Another caller's compare-and-set (the normal-completion path, or another sweep pass) already
  // claimed and recorded this response first.
  | 'lost-race'
  // Usage was already recorded by a prior ambiguous or concurrent owner; cleanup still committed.
  | 'already-recorded'
  // Claimed and written to ai_usage_records.
  | 'recorded'

export interface ClaimAndRecordUsageParams {
  responseId: string
  leaseToken: string
  agentSlug: string
  communityId?: string | null
  postId?: string | null
  usage: OpenAIUsage
  model: string | undefined
  serviceTier: string | undefined
  /** openai_background_responses.created_at -- the response's true creation time. Forwarded to
   *  recordAiUsage so the ledger row's id is backdated to the request's day (see
   *  RecordAiUsageOptions.createdAt in @services/ai-usage/record.mts). */
  createdAt: Date
}

/**
 * The compare-and-set delete and the ledger insert run in one transaction: if recordAiUsage fails,
 * the delete rolls back with it, so the row stays registered for the next claimant instead of the
 * usage being silently dropped. Shared by the normal-completion path
 * (backend/agents/_shared/record-response-usage.mts) and the sweeper reconciler (reconcile.mts) --
 * the only two callers of deleteBackgroundResponseRegistration -- so neither can record the same
 * response id twice. See deleteBackgroundResponseRegistration (claim.mts) for the compare-and-set
 * semantics.
 */
export async function claimAndRecordBackgroundResponseUsage(
  params: ClaimAndRecordUsageParams,
): Promise<ClaimAndRecordUsageResult> {
  await using query = await beginTransaction()
  const claimed = await deleteBackgroundResponseRegistration(
    params.responseId,
    params.leaseToken,
    query,
  )
  if (!claimed) {
    await query.commit()
    return 'lost-race'
  }
  const result = await recordAiUsage({
    responseId: params.responseId,
    communityId: params.communityId ?? null,
    postId: params.postId ?? null,
    agentSlug: params.agentSlug,
    model: params.model ?? 'unknown-model',
    serviceTier: params.serviceTier ?? 'unknown-tier',
    usage: params.usage,
    createdAt: params.createdAt,
    query,
  })
  await query.commit()
  return result
}
