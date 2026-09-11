import { type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { IneligibleStripePurchase } from './ineligible-stripe-purchase-reversal-types.mts'
import { isHigherMembershipPlan } from './plan-ranking.mts'
import type { Membership } from './types.mts'

export type CurrentMembershipForIneligiblePurchase = {
  effectiveAt: Date
  expiresAt: Date | null
  plan: Membership['plan']
  provider: 'stripe' | null
  providerApplicationId: string | null
  providerEnvironment: 'test' | 'production' | null
  providerLineageId: string | null
  sourceKind: 'admin_grant' | 'direct' | 'family'
}

export type IneligiblePurchaseDisposition = 'converged' | 'ineligible' | 'none'

export async function getLockedCurrentMembership(
  userId: string,
  query: QueryExecutor,
): Promise<CurrentMembershipForIneligiblePurchase | null> {
  await query(sql`/* getLockedCurrentMembershipForIneligiblePurchase: lock user */
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE`)
  const { rows } = await query(sql`/* getLockedCurrentMembershipForIneligiblePurchase */
    SELECT membership.effective_at AS "effectiveAt", membership.expires_at AS "expiresAt",
      product.plan, lineage.provider,
      lineage.environment AS "providerEnvironment",
      lineage.application_id AS "providerApplicationId",
      lineage.provider_lineage_id AS "providerLineageId",
      source.source_kind AS "sourceKind"
    FROM memberships membership
    INNER JOIN membership_products product ON product.id = membership.membership_product_id
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    LEFT JOIN membership_source_states source_state
      ON source_state.membership_source_id = source.id
    LEFT JOIN membership_provider_observations observation
      ON observation.id = source_state.membership_provider_observation_id
    LEFT JOIN membership_provider_evidence_records evidence
      ON evidence.id = observation.membership_provider_evidence_id
    LEFT JOIN membership_provider_lineages lineage
      ON lineage.id = source.membership_provider_lineage_id
    WHERE membership.user_id = ${userId}
      AND membership.projection_ended_at IS NULL
      AND membership.cancelled_at IS NULL
      AND membership.expired_at IS NULL
      AND (source.source_kind <> 'direct' OR membership.paused_at IS NULL)
      AND (
        membership.expires_at IS NULL
        OR membership.expires_at > CURRENT_TIMESTAMP
        OR source.source_kind = 'direct'
      )
      AND (
        source.source_kind <> 'family'
        OR (
          source_state.cancelled_at IS NULL
          AND source_state.expired_at IS NULL
          AND source_state.past_due_at IS NULL
          AND source_state.paused_at IS NULL
          AND source_state.effective_at <= CURRENT_TIMESTAMP
          AND (source_state.expires_at IS NULL OR source_state.expires_at > CURRENT_TIMESTAMP)
          AND evidence.verified_at IS NOT NULL
          AND evidence.rejected_at IS NULL
        )
      )
    FOR UPDATE OF membership`)
  return (rows[0] as CurrentMembershipForIneligiblePurchase | undefined) ?? null
}

export function getPurchaseDisposition(
  membership: CurrentMembershipForIneligiblePurchase | null,
  options: Pick<
    IneligibleStripePurchase,
    | 'incomingPlan'
    | 'incomingStatus'
    | 'providerApplicationId'
    | 'providerEnvironment'
    | 'subscriptionId'
  >,
): IneligiblePurchaseDisposition {
  if (!membership) return 'none'
  if (
    membership.provider === 'stripe' &&
    membership.providerLineageId === options.subscriptionId &&
    membership.providerEnvironment === options.providerEnvironment &&
    membership.providerApplicationId === (options.providerApplicationId ?? 'voucha-web')
  )
    return 'converged'
  return isIneligiblePurchase(membership, options.incomingPlan, options.incomingStatus)
    ? 'ineligible'
    : 'none'
}

export function isIneligiblePurchase(
  membership: CurrentMembershipForIneligiblePurchase | null,
  incomingPlan: Membership['plan'],
  incomingStatus: Membership['status'],
): boolean {
  if (
    !membership ||
    (membership.sourceKind === 'admin_grant' &&
      membership.expiresAt !== null &&
      membership.expiresAt <= new Date())
  )
    return false
  if (incomingStatus !== 'active') return true
  if (membership.sourceKind === 'direct') return true
  return !isHigherMembershipPlan(incomingPlan, membership.plan)
}
