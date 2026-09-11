import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getMembershipByUserId } from './get.mts'
import {
  getMembershipManagementDestination,
  type MembershipPurchaseProvider,
} from './purchase-intents.mts'
import { getMembershipPendingState } from './membership-overview-pending.mts'

type SourceSummaryRow = {
  id: string
  source_kind: 'direct' | 'family' | 'admin_grant'
  provider: MembershipPurchaseProvider | null
  plan: 'plus' | 'pro'
  effective_at: Date
  expires_at: Date | null
  cancelled_at: Date | null
  expired_at: Date | null
  past_due_at: Date | null
  paused_at: Date | null
  auto_renews: boolean
  renewal_membership_product_id: string | null
  renewal_effective_at: Date | null
  renewal_price_minor_units: string | null
  renewal_price_currency_code: string | null
  revoked: boolean
  is_effective: boolean
}

export async function getMembershipOverview(userId: string) {
  const [membership, sourceResult, pending] = await Promise.all([
    getMembershipByUserId(userId),
    read<SourceSummaryRow>(sql`/* getMembershipOverview.sources */
      SELECT source.id, source.source_kind, lineage.provider, product.plan,
        state.effective_at, state.expires_at, state.cancelled_at,
        state.expired_at, state.past_due_at, state.paused_at, state.auto_renews,
        observation.renewal_membership_product_id, observation.renewal_effective_at,
        observation.renewal_price_minor_units, observation.renewal_price_currency_code,
        (evidence.rejected_at IS NOT NULL OR EXISTS (
          SELECT 1 FROM membership_refunds refund
          WHERE refund.membership_source_id = source.id AND refund.revoked_access
        )) AS revoked,
        EXISTS (
          SELECT 1 FROM memberships projection
          WHERE projection.membership_source_id = source.id
            AND projection.projection_ended_at IS NULL
        ) AS is_effective
      FROM membership_sources source
      INNER JOIN membership_source_states state ON state.membership_source_id = source.id
      INNER JOIN membership_products product ON product.id = state.membership_product_id
      LEFT JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id
      LEFT JOIN membership_provider_observations observation
        ON observation.id = state.membership_provider_observation_id
      LEFT JOIN membership_provider_evidence_records evidence
        ON evidence.id = observation.membership_provider_evidence_id
      WHERE source.user_id = ${userId}
      ORDER BY state.effective_at DESC, source.id DESC`),
    getMembershipPendingState(userId),
  ])
  const sources = sourceResult.rows.map(row => ({
    id: row.id,
    kind: row.source_kind,
    provider: row.provider,
    plan: row.plan,
    status: sourceStatus(row),
    effective_at: row.effective_at,
    access_ends_at: row.expires_at,
    auto_renews: row.auto_renews,
    is_effective: row.is_effective,
    renewal:
      row.renewal_membership_product_id && row.renewal_effective_at
        ? {
            product_id: row.renewal_membership_product_id,
            effective_at: row.renewal_effective_at,
            price:
              row.renewal_price_minor_units && row.renewal_price_currency_code
                ? {
                    amount: Number(row.renewal_price_minor_units),
                    currency: row.renewal_price_currency_code,
                  }
                : null,
          }
        : null,
  }))
  const manageableDirect = sources.find(source => source.kind === 'direct')
  const switches = sources.flatMap(source =>
    source.kind === 'direct' && !source.is_effective
      ? [
          {
            source_id: source.id,
            provider: source.provider,
            plan: source.plan,
            eligible_at: membership?.expires_at ?? source.effective_at,
          },
        ]
      : [],
  )
  if (!membership)
    return {
      membership: null,
      sources,
      pending: { ...pending, switches },
      management: providerManagement(manageableDirect?.provider ?? null),
    }
  const {
    stripe_subscription_id: _,
    stripe_customer_id: _customer,
    sku,
    ...effectiveMembership
  } = membership
  const { stripe_price_id: _stripePrice, price: _price, ...safeProduct } = sku
  return {
    membership: { ...effectiveMembership, product: safeProduct },
    sources,
    pending: { ...pending, switches },
    management: providerManagement(manageableDirect?.provider ?? null),
  }
}

function sourceStatus(row: SourceSummaryRow) {
  if (row.revoked) return 'revoked' as const
  if (row.cancelled_at) return 'cancelled' as const
  if (row.expired_at) return 'expired' as const
  if (row.past_due_at) return 'past_due' as const
  if (row.paused_at) return 'paused' as const
  return 'active' as const
}

function providerManagement(provider: MembershipPurchaseProvider | null) {
  if (!provider) return null
  return { provider, destination: getMembershipManagementDestination(provider) }
}
