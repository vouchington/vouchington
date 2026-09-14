import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type {
  Membership,
  MembershipChange,
  MembershipPlanSlug,
  MembershipStatus,
} from './types.mts'
import type { StripeMembershipSourceIdentity } from './create-types.mts'
export {
  getActivePlans,
  getActivePlansCached,
  getSkuByStripePriceId,
  getSkuByStripePriceIdCached,
  getSkuByStripePriceIdForLifecycle,
  invalidateMembershipProductCaches,
} from './get-catalog.mts'
export {
  getMembershipRefundTargetByStripeSubscriptionId,
  getMembershipSourceCancelledAt,
  getMembershipSourceIdByMembershipId,
  getStripeSubscriptionIdByMembershipSourceId,
} from './refunds/index.mts'
export { getLatestMembershipByUserId } from './get-by-id.mts'

export async function getUserActivePlan(
  userId: string,
  options?: QueryOptions,
): Promise<MembershipPlanSlug | null> {
  return (await getUserActiveMembership(userId, options))?.plan ?? null
}

export async function getUserActiveMembership(
  userId: string,
  options?: QueryOptions,
): Promise<Pick<Membership, 'plan' | 'expires_at'> | null> {
  const { rows } = await read(
    sql`/* getUserActivePlan */
    SELECT
      plan,
      CASE
        WHEN status = 'past_due' OR stripe_subscription_id IS NOT NULL THEN NULL
        ELSE expires_at
      END AS expires_at
    FROM view_memberships
    WHERE user_id = ${userId}
      AND status IN ('active', 'past_due')
    LIMIT 1
    `,
    options,
  )
  return (rows[0] as Pick<Membership, 'plan' | 'expires_at'> | undefined) ?? null
}

export async function getMembershipByUserId(
  userId: string,
  options?: QueryOptions,
): Promise<Membership | null> {
  const { rows } = await read(
    sql`/* getMembershipByUserId */
    SELECT *
    FROM view_memberships
    WHERE user_id = ${userId}
      AND status IN ('active', 'past_due', 'paused')
    LIMIT 1
  `,
    options,
  )
  return (rows[0] as Membership) ?? null
}

export async function getMembershipByStripeSubscriptionId(
  sourceIdentity: StripeMembershipSourceIdentity,
  options?: QueryOptions,
): Promise<Membership | null> {
  const { rows } = await write(
    sql`/* getMembershipByStripeSubscriptionId */
    SELECT membership.*
    FROM view_memberships membership
    INNER JOIN memberships projection ON projection.id = membership.id
    INNER JOIN membership_sources source ON source.id = projection.membership_source_id
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = source.membership_provider_lineage_id
    WHERE source.source_kind = 'direct'
      AND lineage.provider = ${sourceIdentity.provider}
      AND lineage.environment = ${sourceIdentity.environment}
      AND lineage.application_id = ${sourceIdentity.applicationId}
      AND lineage.provider_lineage_id = ${sourceIdentity.providerLineageId}
    LIMIT 1
  `,
    options,
  )
  return (rows[0] as Membership) ?? null
}

/**
 * Returns the owner of a direct source whose projection was superseded by another source. Stripe
 * subscription updates must still reconcile that retained source authoritatively.
 */
export async function getRetainedDirectMembershipSourceByStripeIdentity(
  sourceIdentity: StripeMembershipSourceIdentity,
  options?: QueryOptions,
): Promise<{ membershipId: string | null; userId: string; status: MembershipStatus } | null> {
  const { rows } = await write(
    sql`/* getRetainedDirectMembershipSourceByStripeIdentity */
    SELECT source.user_id, historical_membership.id AS membership_id,
      CASE
        WHEN source_state.cancelled_at IS NOT NULL THEN 'cancelled'
        WHEN source_state.expired_at IS NOT NULL THEN 'expired'
        WHEN source_state.paused_at IS NOT NULL THEN 'paused'
        WHEN source_state.past_due_at IS NOT NULL THEN 'past_due'
        ELSE 'active'
      END AS status
    FROM membership_sources source
    INNER JOIN membership_provider_lineages lineage
      ON lineage.id = source.membership_provider_lineage_id
    INNER JOIN membership_source_states source_state
      ON source_state.membership_source_id = source.id
    LEFT JOIN LATERAL (
      SELECT id FROM memberships
      WHERE membership_source_id = source.id
      ORDER BY id DESC
      LIMIT 1
    ) historical_membership ON true
    WHERE source.source_kind = 'direct'
      AND source.user_id IS NOT NULL
      AND lineage.provider = ${sourceIdentity.provider}
      AND lineage.environment = ${sourceIdentity.environment}
      AND lineage.application_id = ${sourceIdentity.applicationId}
      AND lineage.provider_lineage_id = ${sourceIdentity.providerLineageId}
    LIMIT 1
  `,
    options,
  )
  const retained = rows[0] as
    | { membership_id: string | null; user_id: string; status: MembershipStatus }
    | undefined
  return retained
    ? { membershipId: retained.membership_id, userId: retained.user_id, status: retained.status }
    : null
}

export async function getMembershipHistory(userId: string): Promise<MembershipChange[]> {
  const { rows } = await read(sql`/* getMembershipHistory */
    SELECT
      membership_change.id,
      membership_change.membership_id,
      membership_change.user_id,
      membership_change.change_type,
      from_product.plan AS from_plan,
      to_product.plan AS to_plan,
      membership_change.from_membership_product_id AS from_sku_id,
      membership_change.to_membership_product_id AS to_sku_id,
      membership_change.cancelled_at,
      membership_change.expired_at,
      membership_change.past_due_at,
      membership_change.paused_at,
      membership_change.cancel_at_period_end,
      membership_change.changed_by_id,
      membership_change.note,
      membership_change.stripe_event_id,
      membership_change.membership_provider_evidence_id,
      membership_change.created_at
    FROM membership_changes membership_change
    LEFT JOIN membership_products from_product ON from_product.id = membership_change.from_membership_product_id
    LEFT JOIN membership_products to_product ON to_product.id = membership_change.to_membership_product_id
    WHERE membership_change.user_id = ${userId}
    ORDER BY membership_change.id DESC
  `)
  return rows as MembershipChange[]
}
