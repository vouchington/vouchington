import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { StripeMembershipSourceIdentity } from '@services/memberships/create-types'
import {
  getQualifyingStripeCollisionLanes,
  type QualifyingStripeCollision,
} from '@services/memberships/ineligible-stripe-purchase-reversal/collision-resolution'
import type { MembershipPlanSlug } from '@services/memberships/types'

export type ExistingCapturedStripeSource = QualifyingStripeCollision & {
  id: string
  lineageId: string
  bindingId: string
  providerAccountId: string | null
}

/** Reads only a current owner binding with captured financial facts. */
export async function getExistingCapturedStripeSource(
  options: {
    userId: string
    sourceIdentity: StripeMembershipSourceIdentity
    customerId: string
    purchasePlan: MembershipPlanSlug
  },
  query: QueryExecutor,
): Promise<ExistingCapturedStripeSource | null> {
  const { rows } = await query<ExistingCapturedStripeSource>(
    buildGetExistingCapturedStripeSourceQuery(options),
  )
  return rows[0] ?? null
}

export function buildGetExistingCapturedStripeSourceQuery(options: {
  userId: string
  sourceIdentity: StripeMembershipSourceIdentity
  customerId: string
  purchasePlan: MembershipPlanSlug
}) {
  const lanes = getQualifyingStripeCollisionLanes([options.purchasePlan])
  return sql`/* getExistingCapturedStripeSource */
    SELECT source.id, lineage.id AS "lineageId", binding.id AS "bindingId",
      lineage.provider_account_id AS "providerAccountId",
      earliest.winning_source_kind AS "winningSourceKind",
      earliest.winning_plan AS "winningPlan",
      earliest.collision_at AS "collisionAt"
    FROM membership_provider_contexts context
    INNER JOIN membership_provider_lineages lineage
      ON lineage.membership_provider_context_id = context.id
    INNER JOIN membership_sources source
      ON source.membership_provider_lineage_id = lineage.id
    INNER JOIN membership_lineage_bindings binding
      ON binding.membership_provider_lineage_id = lineage.id
    CROSS JOIN LATERAL (
      SELECT collision.winning_source_kind, collision.winning_plan, collision.collision_at
      FROM UNNEST(
        ${lanes.map(lane => lane.winningSourceKind)}::membership_source_kinds[],
        ${lanes.map(lane => lane.winningPlan)}::membership_plan_slugs[]
      ) AS lane(source_kind, plan)
      CROSS JOIN LATERAL (
        SELECT work.winning_source_kind, work.winning_plan, work.collision_at
        FROM membership_stripe_purchase_collision_work_items work
        WHERE work.membership_source_id = source.id
          AND work.membership_provider_lineage_id = lineage.id
          AND work.membership_lineage_binding_id = binding.id
          AND work.winning_source_kind = lane.source_kind
          AND work.winning_plan = lane.plan
        ORDER BY work.collision_at LIMIT 1
      ) collision
      ORDER BY collision.collision_at, collision.winning_source_kind, collision.winning_plan
      LIMIT 1
    ) earliest
    WHERE context.provider = 'stripe'
      AND context.environment = ${options.sourceIdentity.environment}
      AND context.application_id = ${options.sourceIdentity.applicationId}
      AND lineage.provider_lineage_id = ${options.sourceIdentity.providerLineageId}
      AND (lineage.provider_account_id IS NULL
        OR lineage.provider_account_id = ${options.customerId})
      AND source.source_kind = 'direct' AND source.user_id = ${options.userId}
      AND binding.source_kind = 'direct' AND binding.user_id = ${options.userId}
      AND binding.released_at IS NULL
    LIMIT 1
  `
}

export function buildGetWinningMembershipForStripePurchaseQuery(
  userId: string,
  periodStartedAt: Date,
) {
  return sql`/* getWinningMembershipForStripePurchase */
    SELECT source.source_kind AS "sourceKind",
      (SELECT product.plan FROM membership_products product
        WHERE product.id = membership.membership_product_id) AS plan,
      membership.effective_at AS "effectiveAt"
    FROM memberships membership
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    LEFT JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id
    LEFT JOIN membership_provider_contexts context ON context.id = lineage.membership_provider_context_id
    WHERE membership.user_id = ${userId}
      AND membership.projection_ended_at IS NULL
      AND membership.cancelled_at IS NULL AND membership.expired_at IS NULL
      AND membership.paused_at IS NULL
      AND (membership.expires_at IS NULL OR membership.expires_at > ${periodStartedAt})
      AND (source.source_kind = 'family'
        OR (source.source_kind = 'direct' AND context.provider IN ('apple_app_store', 'google_play', 'microsoft_store')))
    LIMIT 1
  `
}

export function buildLockStripePurchaseOwnerForCollisionQuery(userId: string) {
  return sql`/* detectIneligibleStripePurchaseFromInvoicePayment:lockUser */
    SELECT id FROM users WHERE id = ${userId}`
}

export function buildGetBoundStripeSubscriptionOwnerForCollisionQuery(
  sourceIdentity: {
    environment: 'test' | 'production'
    applicationId: string
    providerLineageId: string
  },
  customerId: string,
) {
  return sql`/* getBoundStripeSubscriptionOwnerForCollision */
    SELECT source.user_id AS "userId"
    FROM membership_provider_contexts context
    INNER JOIN membership_provider_lineages lineage
      ON lineage.membership_provider_context_id = context.id
    INNER JOIN membership_lineage_bindings binding
      ON binding.membership_provider_lineage_id = lineage.id
    INNER JOIN membership_sources source
      ON source.membership_provider_lineage_id = lineage.id
      AND source.user_id = binding.user_id
    INNER JOIN users account ON account.id = source.user_id
    WHERE context.provider = 'stripe'
      AND context.environment = ${sourceIdentity.environment}
      AND context.application_id = ${sourceIdentity.applicationId}
      AND lineage.provider_lineage_id = ${sourceIdentity.providerLineageId}
      AND lineage.provider_account_id = ${customerId}
      AND binding.source_kind = 'direct' AND binding.released_at IS NULL
      AND source.source_kind = 'direct'
    LIMIT 1
  `
}
