import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipPlanSlug } from '../types.mts'
import { getMembershipWorkLimits } from '../work-limits.mts'
import { retainOldestQueuedGrantPerPlan } from './retain-oldest-queued-grant-per-plan.mts'
import { selectHighestPriorityMembershipSource } from './select-highest-priority-source.mts'

export type ValidFallbackSource = {
  should_auto_renew: boolean
  effective_at: Date
  expires_at: Date | null
  grant_created_at: Date | null
  has_open_grant_activation: boolean
  membership_product_id: string
  membership_source_id: string
  past_due_at: Date | null
  plan: MembershipPlanSlug
  source_kind: 'admin_grant' | 'direct' | 'family'
}

export async function getHighestPriorityFallbackSource(
  userId: string,
  currentSourceId: string,
  query: QueryExecutor,
  membershipSourceId?: string,
): Promise<ValidFallbackSource | undefined> {
  const { batchSize } = getMembershipWorkLimits()
  let bestNonQueued: ValidFallbackSource | undefined
  let oldestQueuedByPlan: ValidFallbackSource[] = []
  let afterSourceId: string | null = null
  while (true) {
    const cursorSourceId: string | null = afterSourceId
    // oxlint-disable-next-line no-await-in-loop -- keyset page advances sequentially through this user's fallback sources
    const result: { rows: ValidFallbackSource[] } = await query<ValidFallbackSource>( // no-mistakes-disable-line query-reached-per-item: keyset pagination bounds each statement to DynamicConfig batchSize (hard max 5000), not total sources, and folds each page into bestNonQueued plus oldest queued grant per plan
      sql`/* restoreFallbackAfterCurrentAccessEnds: sources */
        SELECT source.id AS membership_source_id, source_state.membership_product_id,
          source.source_kind, source_state.should_auto_renew, source_state.effective_at,
          source_state.expires_at, source_state.past_due_at, product.plan,
          grant_row.created_at AS grant_created_at, activation.id IS NOT NULL AS has_open_grant_activation
        FROM membership_sources source
        INNER JOIN membership_source_states source_state
          ON source_state.membership_source_id = source.id
        INNER JOIN membership_products product ON product.id = source_state.membership_product_id
        LEFT JOIN membership_provider_observations observation ON observation.id = source_state.membership_provider_observation_id
        LEFT JOIN membership_provider_contexts observation_context ON observation_context.id = observation.membership_provider_context_id
        LEFT JOIN membership_provider_evidence_records evidence
          ON evidence.id = observation.membership_provider_evidence_record_id
        LEFT JOIN membership_grants grant_row ON grant_row.membership_source_id = source.id
        LEFT JOIN membership_grant_activation_periods activation
          ON activation.membership_grant_id = grant_row.id AND activation.ended_at IS NULL
        WHERE source.user_id = ${userId} AND source.id <> ${currentSourceId}
          AND (${membershipSourceId ?? null}::uuid IS NULL OR source.id = ${membershipSourceId ?? null}::uuid)
          AND (${cursorSourceId}::uuid IS NULL OR source.id > ${cursorSourceId}::uuid)
          AND source_state.effective_at <= CURRENT_TIMESTAMP
          AND (
            (source.source_kind = 'direct'
              AND source_state.cancelled_at IS NULL AND source_state.expired_at IS NULL
              AND source_state.paused_at IS NULL
              AND (observation_context.provider = 'stripe' OR source_state.expires_at IS NULL OR source_state.expires_at > CURRENT_TIMESTAMP)
              AND evidence.verified_at IS NOT NULL AND evidence.rejected_at IS NULL)
            OR (
              source.source_kind = 'family'
              AND source_state.cancelled_at IS NULL AND source_state.expired_at IS NULL
              AND source_state.past_due_at IS NULL AND source_state.paused_at IS NULL
              AND (source_state.expires_at IS NULL OR source_state.expires_at > CURRENT_TIMESTAMP)
              AND evidence.verified_at IS NOT NULL AND evidence.rejected_at IS NULL
            )
            OR (
              source.source_kind = 'admin_grant'
              AND source_state.cancelled_at IS NULL AND source_state.expired_at IS NULL
              AND source_state.past_due_at IS NULL AND source_state.paused_at IS NULL
              AND (source_state.expires_at IS NULL OR source_state.expires_at > CURRENT_TIMESTAMP)
              AND grant_row.revoked_at IS NULL
              AND fn_membership_grant_remaining_duration(grant_row.id) >= INTERVAL '1 millisecond'
            )
          )
        ORDER BY source.id ASC
        LIMIT ${batchSize}
      `,
    )
    const pageNonQueued: ValidFallbackSource[] = []
    const pageQueued: ValidFallbackSource[] = []
    for (const row of result.rows) {
      if (row.source_kind === 'admin_grant' && !row.has_open_grant_activation) pageQueued.push(row)
      else pageNonQueued.push(row)
    }
    bestNonQueued = selectHighestPriorityMembershipSource(
      bestNonQueued ? [bestNonQueued, ...pageNonQueued] : pageNonQueued,
    )
    if (pageQueued.length > 0) {
      oldestQueuedByPlan = retainOldestQueuedGrantPerPlan([...oldestQueuedByPlan, ...pageQueued])
    }
    if (result.rows.length < batchSize) break
    afterSourceId = result.rows.at(-1)!.membership_source_id
  }
  return selectHighestPriorityMembershipSource(
    bestNonQueued ? [bestNonQueued, ...oldestQueuedByPlan] : oldestQueuedByPlan,
  )
}
