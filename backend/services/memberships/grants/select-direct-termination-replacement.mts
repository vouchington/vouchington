import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { selectHighestPriorityMembershipSource } from '../fallback/select-highest-priority-source.mts'
import type { MembershipPlanSlug } from '../types.mts'

type DirectTerminationReplacement = {
  effective_at: Date
  membership_source_id: string
  plan: MembershipPlanSlug
  source_kind: 'admin_grant' | 'direct' | 'family'
}

/** Selects a replacement before a queued or paused grant starts consuming its duration. */
export async function selectDirectTerminationReplacement(
  userId: string,
  terminatedSourceId: string,
  query: QueryExecutor,
): Promise<DirectTerminationReplacement | undefined> {
  const { rows } = await query(sql`/* resumeGrantAfterDirectTermination: replacement priority */
    WITH oldest_eligible_grants_per_plan AS (
      SELECT DISTINCT ON (product.plan)
        grant_row.membership_source_id, 'admin_grant'::membership_source_kinds AS source_kind,
        COALESCE(source_state.effective_at, grant_row.created_at) AS effective_at, product.plan
      FROM membership_grants grant_row
      INNER JOIN membership_sources source ON source.id = grant_row.membership_source_id
      INNER JOIN membership_products product ON product.id = grant_row.membership_product_id
      LEFT JOIN membership_source_states source_state
        ON source_state.membership_source_id = grant_row.membership_source_id
      WHERE grant_row.user_id = ${userId} AND grant_row.revoked_at IS NULL
        AND source.source_kind = 'admin_grant'
        AND (source_state.membership_source_id IS NULL OR (
          source_state.cancelled_at IS NULL AND source_state.expired_at IS NULL
          AND source_state.paused_at IS NULL
        ))
        AND membership_grant_remaining_duration(grant_row.id) >= INTERVAL '1 millisecond'
        AND NOT EXISTS (
          SELECT 1 FROM membership_grant_activation_periods activation
          WHERE activation.membership_grant_id = grant_row.id AND activation.ended_at IS NULL
        )
      ORDER BY product.plan, grant_row.created_at ASC, grant_row.id ASC
    )
    SELECT source.id AS membership_source_id, source.source_kind, source_state.effective_at,
      product.plan
    FROM membership_sources source
    INNER JOIN membership_source_states source_state
      ON source_state.membership_source_id = source.id
    INNER JOIN membership_products product ON product.id = source_state.membership_product_id
    LEFT JOIN membership_provider_observations observation
      ON observation.id = source_state.membership_provider_observation_id
    LEFT JOIN membership_provider_evidence_records evidence
      ON evidence.id = observation.membership_provider_evidence_id
    WHERE source.user_id = ${userId} AND source.id <> ${terminatedSourceId}
      AND source.source_kind IN ('direct', 'family')
      AND source_state.effective_at <= CURRENT_TIMESTAMP
      AND source_state.cancelled_at IS NULL AND source_state.expired_at IS NULL
      AND source_state.paused_at IS NULL
      AND (source.source_kind = 'direct' OR source_state.past_due_at IS NULL)
      AND (source.source_kind = 'direct'
        OR source_state.expires_at IS NULL OR source_state.expires_at > CURRENT_TIMESTAMP)
      AND evidence.verified_at IS NOT NULL AND evidence.rejected_at IS NULL
    UNION ALL
    SELECT membership_source_id, source_kind, effective_at, plan
    FROM oldest_eligible_grants_per_plan`)
  return selectHighestPriorityMembershipSource(rows as DirectTerminationReplacement[])
}
