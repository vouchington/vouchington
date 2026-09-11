import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipProviderSourceIdentity } from './create-types.mts'
import type { PriorMembership } from './reconcile-source-projection.mts'
import type { MembershipPlanSlug, MembershipStatus } from './types.mts'

export type VerifiedProviderObservation = {
  autoRenews: boolean
  effectiveAt: Date
  expiresAt: Date | null
  membershipProductId: string
  membershipProviderEvidenceId: string
  plan: MembershipPlanSlug
  sourceIdentity: MembershipProviderSourceIdentity
  sourceKind: 'direct' | 'family'
  status: MembershipStatus
  timing: {
    authoritativeEffectiveAt: Date
    effectiveAt: Date
    expiresAt: Date | null
    terminalEffectiveAt: Date | null
    transitionEffectiveAt: Date | null
  }
}

export async function getVerifiedProviderObservation(
  options: {
    membershipProviderObservationId: string
    sourceIdentity?: MembershipProviderSourceIdentity
  },
  query: QueryExecutor,
): Promise<VerifiedProviderObservation> {
  const { rows } = await query(sql`/* getVerifiedProviderObservation */
    SELECT observation.source_kind, observation.membership_product_id,
      observation.effective_at, observation.expires_at, observation.cancelled_at,
      observation.expired_at, observation.past_due_at, observation.paused_at, observation.auto_renews,
      observation.membership_provider_evidence_id, product.plan, lineage.provider, lineage.environment,
      lineage.application_id, lineage.provider_lineage_id, lineage.provider_account_id
    FROM membership_provider_observations observation
    INNER JOIN membership_provider_evidence_records evidence
      ON evidence.id = observation.membership_provider_evidence_id
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = observation.membership_provider_lineage_id
    INNER JOIN membership_products product ON product.id = observation.membership_product_id
    WHERE observation.id = ${options.membershipProviderObservationId}
      AND evidence.verified_at IS NOT NULL AND evidence.rejected_at IS NULL
    FOR KEY SHARE OF observation, evidence, lineage`)
  const row = rows[0] as ObservationRow | undefined
  if (!row || (row.source_kind !== 'direct' && row.source_kind !== 'family'))
    throw new Error('Verified provider observation was not found')
  const sourceIdentity = {
    provider: row.provider,
    environment: row.environment,
    applicationId: row.application_id,
    providerLineageId: row.provider_lineage_id,
    providerAccountId: row.provider_account_id,
  } satisfies MembershipProviderSourceIdentity
  if (!matchesIdentity(options.sourceIdentity, sourceIdentity))
    throw new Error('Provider observation identity does not match the requested source')
  const status = getObservationStatus(row)
  return {
    autoRenews: row.auto_renews,
    effectiveAt: row.effective_at,
    expiresAt: row.expires_at,
    membershipProductId: row.membership_product_id,
    membershipProviderEvidenceId: row.membership_provider_evidence_id,
    plan: row.plan,
    sourceIdentity,
    sourceKind: row.source_kind,
    status,
    timing: {
      authoritativeEffectiveAt: row.effective_at,
      effectiveAt: row.effective_at,
      expiresAt: row.expires_at,
      terminalEffectiveAt: status === 'cancelled' ? row.cancelled_at : row.expired_at,
      transitionEffectiveAt:
        status === 'past_due' ? row.past_due_at : status === 'paused' ? row.paused_at : null,
    },
  }
}

export async function getLatestProviderSourceProjection(
  membershipSourceId: string,
  query: QueryExecutor,
): Promise<PriorMembership | undefined> {
  const { rows } = await query(sql`/* getLatestProviderSourceProjection */
    SELECT membership.id, membership.membership_source_id, membership.membership_product_id,
      product.plan, membership.expires_at, membership.cancelled_at, membership.expired_at,
      membership.past_due_at, membership.paused_at, membership.cancel_at_period_end,
      membership.projection_ended_at
    FROM memberships membership
    INNER JOIN membership_products product ON product.id = membership.membership_product_id
    WHERE membership.membership_source_id = ${membershipSourceId}
    ORDER BY membership.created_at DESC, membership.id DESC
    LIMIT 1
    FOR UPDATE OF membership`)
  return rows[0] as PriorMembership | undefined
}

export async function getCurrentProviderProjection(
  userId: string,
  query: QueryExecutor,
): Promise<(PriorMembership & { source_kind: 'admin_grant' | 'direct' | 'family' }) | undefined> {
  const { rows } = await query(sql`/* getCurrentProviderProjection */
    SELECT membership.id, membership.membership_source_id, membership.membership_product_id,
      product.plan, membership.expires_at, membership.cancelled_at, membership.expired_at,
      membership.past_due_at, membership.paused_at, membership.cancel_at_period_end,
      membership.projection_ended_at, source.source_kind
    FROM memberships membership
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    INNER JOIN membership_products product ON product.id = membership.membership_product_id
    WHERE membership.user_id = ${userId} AND membership.projection_ended_at IS NULL
    FOR UPDATE OF membership`)
  return rows[0] as
    | (PriorMembership & {
        source_kind: 'admin_grant' | 'direct' | 'family'
      })
    | undefined
}

function matchesIdentity(
  expected: MembershipProviderSourceIdentity | undefined,
  actual: MembershipProviderSourceIdentity,
): boolean {
  return (
    !expected ||
    (expected.provider === actual.provider &&
      expected.environment === actual.environment &&
      expected.applicationId === actual.applicationId &&
      expected.providerLineageId === actual.providerLineageId &&
      (expected.providerAccountId === undefined ||
        expected.providerAccountId === actual.providerAccountId))
  )
}

function getObservationStatus(row: ObservationRow): MembershipStatus {
  if (row.cancelled_at) return 'cancelled'
  if (row.expired_at) return 'expired'
  if (row.paused_at) return 'paused'
  if (row.past_due_at) return 'past_due'
  return 'active'
}

type ObservationRow = {
  application_id: string
  auto_renews: boolean
  cancelled_at: Date | null
  effective_at: Date
  environment: 'test' | 'production'
  expired_at: Date | null
  expires_at: Date | null
  membership_product_id: string
  membership_provider_evidence_id: string
  past_due_at: Date | null
  paused_at: Date | null
  plan: MembershipPlanSlug
  provider: MembershipProviderSourceIdentity['provider']
  provider_account_id: string | null
  provider_lineage_id: string
  source_kind: 'admin_grant' | 'direct' | 'family'
}
