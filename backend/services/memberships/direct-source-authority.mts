import { read, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipProvider, MembershipProviderSourceIdentity } from './create-types.mts'
import { isHigherMembershipPlan } from './plan-ranking.mts'
import type { MembershipPlanSlug } from './types.mts'

export type DirectMembershipSourceRejectionReason =
  | 'competing_direct_source'
  | 'current_source_not_lower_tier'

export type DirectMembershipSourceAdmission =
  | { accepted: true }
  | {
      accepted: false
      reason: DirectMembershipSourceRejectionReason
      currentSourceKind: 'admin_grant' | 'direct' | 'family'
      currentProvider: MembershipDirectProvider | null
      eligibleAt: Date | null
    }

type MembershipDirectProvider = MembershipProvider

export type MembershipPurchaseTransition = {
  transitionProvider: 'apple_app_store' | 'google_play'
}

export class DirectMembershipSourceRejectedError extends Error {
  readonly reason: DirectMembershipSourceRejectionReason
  readonly currentSourceKind: 'admin_grant' | 'direct' | 'family'

  constructor(
    reason: DirectMembershipSourceRejectionReason,
    currentSourceKind: 'admin_grant' | 'direct' | 'family',
  ) {
    super(reason)
    this.name = 'DirectMembershipSourceRejectedError'
    this.reason = reason
    this.currentSourceKind = currentSourceKind
  }
}

export async function getDirectMembershipSourceAdmission(
  userId: string,
  candidatePlan: MembershipPlanSlug,
  candidateSource?: MembershipProviderSourceIdentity | MembershipPurchaseTransition,
  query: QueryExecutor = read,
): Promise<DirectMembershipSourceAdmission> {
  const { rows } = await query(sql`/* getDirectMembershipSourceAdmission */
    SELECT source.source_kind, product.plan, membership.expires_at, lineage.provider, lineage.environment,
      lineage.application_id, lineage.provider_lineage_id
    FROM memberships membership
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    INNER JOIN membership_products product ON product.id = membership.membership_product_id
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
      )`)
  const current = rows[0] as
    | {
        source_kind: 'admin_grant' | 'direct' | 'family'
        plan: MembershipPlanSlug
        provider: 'stripe' | 'apple_app_store' | 'google_play' | 'microsoft_store' | null
        environment: 'test' | 'production' | null
        application_id: string | null
        provider_lineage_id: string | null
        expires_at: Date | null
      }
    | undefined
  if (!current) return { accepted: true }
  if (current.source_kind === 'direct') {
    if (
      (candidateSource &&
        'transitionProvider' in candidateSource &&
        current.provider === candidateSource.transitionProvider) ||
      (candidateSource &&
        'providerLineageId' in candidateSource &&
        current.provider === candidateSource.provider &&
        current.environment === candidateSource.environment &&
        current.application_id === candidateSource.applicationId &&
        current.provider_lineage_id === candidateSource.providerLineageId)
    )
      return { accepted: true }
    return {
      accepted: false,
      reason: 'competing_direct_source',
      currentSourceKind: current.source_kind,
      currentProvider: current.provider,
      eligibleAt: current.expires_at,
    }
  }
  if (!isHigherMembershipPlan(candidatePlan, current.plan))
    return {
      accepted: false,
      reason: 'current_source_not_lower_tier',
      currentSourceKind: current.source_kind,
      currentProvider: current.provider,
      eligibleAt: current.expires_at,
    }
  return { accepted: true }
}

/**
 * The user row lock makes this second admission check authoritative after checkout/webhook
 * preflight, so concurrent provider subscriptions cannot both replace the same projection.
 */
export async function assertDirectMembershipSourceAdmission(
  userId: string,
  candidatePlan: MembershipPlanSlug,
  candidateSource: MembershipProviderSourceIdentity,
  query: QueryExecutor,
): Promise<void> {
  await query(sql`/* assertDirectMembershipSourceAdmission:lockUser */
    SELECT id FROM users WHERE id = ${userId} FOR UPDATE`)
  const admission = await getDirectMembershipSourceAdmission(
    userId,
    candidatePlan,
    candidateSource,
    query,
  )
  if (!admission.accepted)
    throw new DirectMembershipSourceRejectedError(admission.reason, admission.currentSourceKind)
}
