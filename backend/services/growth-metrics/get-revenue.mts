import { read } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { MONEY_SCALE, type CurrencyCode, type ScaledMoneyAggregate } from '@ts-shared/money'
import sql from 'sql-template-strings'
import type { GrowthRange, Revenue, MembershipsByTier } from './types.mts'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'

export type MembershipRevenueRow = {
  tier: string
  interval: 'monthly' | 'yearly'
  currency_code: CurrencyCode
  minor_unit_exponent: number
  membership_count: number
  total_minor_units: string
}

type RevenueQueryRow = {
  active_membership_rows: Array<{ tier: string; membership_count: number }>
  membership_rows: MembershipRevenueRow[]
  upgrades: number
  downgrades: number
  cancellations: number
}

type RevenueScope = { userIds: readonly string[] }

export async function getRevenue(
  _range: GrowthRange,
  periodStart: Date,
  scope?: RevenueScope,
  context: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<Revenue> {
  const periodStartUuid = getMinUUIDv7ForDate(periodStart)
  const isScoped = scope !== undefined
  const scopedUserIds = scope?.userIds ?? []
  const { rows } = await read<RevenueQueryRow>(sql`/* getRevenue */
    WITH active_membership_counts AS (
      SELECT product.plan AS tier, COUNT(*)::INT AS membership_count
      FROM memberships m
      JOIN view_current_paid_memberships current_paid ON current_paid.user_id = m.user_id
      JOIN membership_products product ON product.id = m.membership_product_id
      WHERE m.projection_ended_at IS NULL
        AND m.cancelled_at IS NULL
        AND m.expired_at IS NULL
        AND m.past_due_at IS NULL
        AND m.paused_at IS NULL
        AND (NOT ${isScoped} OR m.user_id = ANY(${scopedUserIds}::uuid[]))
      GROUP BY product.plan
    ),
    membership_revenue AS (
      SELECT
        product.plan AS tier,
        product.billing_interval AS interval,
        observation.observed_price_currency_code AS currency_code,
        currency.minor_unit_exponent,
        COUNT(*)::INT AS membership_count,
        SUM(observation.observed_price_minor_units)::TEXT AS total_minor_units
      FROM memberships m
      JOIN view_current_paid_memberships current_paid ON current_paid.user_id = m.user_id
      JOIN membership_products product ON product.id = m.membership_product_id
      JOIN membership_sources source
        ON source.id = m.membership_source_id
        AND source.source_kind = 'direct'
      JOIN membership_source_states source_state
        ON source_state.membership_source_id = source.id
        AND source_state.membership_product_id = m.membership_product_id
      JOIN membership_provider_observations observation
        ON observation.id = source_state.membership_provider_observation_id
        AND observation.provider = 'stripe'
        AND observation.environment = 'production'
        AND observation.application_id = ${context.applicationId}
      JOIN currencies currency ON currency.code = observation.observed_price_currency_code
      WHERE m.projection_ended_at IS NULL
        AND m.cancelled_at IS NULL
        AND m.expired_at IS NULL
        AND m.past_due_at IS NULL
        AND m.paused_at IS NULL
        AND (NOT ${isScoped} OR m.user_id = ANY(${scopedUserIds}::uuid[]))
      GROUP BY product.plan, product.billing_interval, observation.observed_price_currency_code, currency.minor_unit_exponent
    ),
    change_counts AS (
      SELECT
        COUNT(*) FILTER (WHERE change_type = 'upgrade')::INT AS upgrades,
        COUNT(*) FILTER (WHERE change_type = 'downgrade')::INT AS downgrades,
        COUNT(*) FILTER (WHERE change_type = 'cancellation')::INT AS cancellations
      FROM membership_changes
      WHERE id > ${periodStartUuid}
        AND (NOT ${isScoped} OR user_id = ANY(${scopedUserIds}::uuid[]))
    )
    SELECT
      COALESCE(
        (
          SELECT JSONB_AGG(
            JSONB_BUILD_OBJECT('tier', tier, 'membership_count', membership_count)
            ORDER BY tier
          )
          FROM active_membership_counts
        ),
        '[]'::JSONB
      ) AS active_membership_rows,
      COALESCE(
        (
          SELECT JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'tier', tier,
              'interval', interval,
              'currency_code', currency_code,
              'minor_unit_exponent', minor_unit_exponent,
              'membership_count', membership_count,
              'total_minor_units', total_minor_units
            )
            ORDER BY tier, interval, currency_code
          )
          FROM membership_revenue
        ),
        '[]'::JSONB
      ) AS membership_rows,
      upgrades,
      downgrades,
      cancellations
    FROM change_counts
  `)
  const row = rows[0]
  const membershipRows = row?.membership_rows ?? []
  const { mrrByCurrency } = calculateMembershipRevenue(membershipRows)
  const activeMembershipRows = row?.active_membership_rows ?? []
  const membershipsByTier = Object.fromEntries(
    activeMembershipRows.map(active => [active.tier, active.membership_count]),
  )
  const activeMemberships = activeMembershipRows.reduce(
    (total, active) => total + active.membership_count,
    0,
  )

  const cancellations = row?.cancellations ?? 0
  return {
    active_memberships: activeMemberships,
    memberships_by_tier: membershipsByTier,
    mrr_by_currency: mrrByCurrency,
    upgrades: row?.upgrades ?? 0,
    downgrades: row?.downgrades ?? 0,
    cancellations,
    churn_rate:
      activeMemberships + cancellations > 0
        ? cancellations / (activeMemberships + cancellations)
        : 0,
  }
}

export function calculateMembershipRevenue(membershipRows: readonly MembershipRevenueRow[]): {
  activeMemberships: number
  membershipsByTier: MembershipsByTier
  mrrByCurrency: ScaledMoneyAggregate[]
} {
  const membershipsByTier: MembershipsByTier = {}
  const amountsByCurrency = new Map<
    CurrencyCode,
    { monthly: bigint; yearly: bigint; minorUnitExponent: number }
  >()
  let activeMemberships = 0
  for (const row of membershipRows) {
    activeMemberships += row.membership_count
    membershipsByTier[row.tier] = (membershipsByTier[row.tier] ?? 0) + row.membership_count
    const current = amountsByCurrency.get(row.currency_code) ?? {
      monthly: 0n,
      yearly: 0n,
      minorUnitExponent: row.minor_unit_exponent,
    }
    current[row.interval] += BigInt(row.total_minor_units)
    amountsByCurrency.set(row.currency_code, current)
  }
  return {
    activeMemberships,
    membershipsByTier,
    mrrByCurrency: calculateMrrByCurrency(amountsByCurrency),
  }
}

export function calculateMrrByCurrency(
  amountsByCurrency: ReadonlyMap<
    CurrencyCode,
    { monthly: bigint; yearly: bigint; minorUnitExponent: number }
  >,
): ScaledMoneyAggregate[] {
  return [...amountsByCurrency.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, totals]) => {
      const scaleFactor = 10n ** BigInt(MONEY_SCALE - totals.minorUnitExponent)
      const annualizedScaled = (totals.monthly * 12n + totals.yearly) * scaleFactor
      const roundedMonthlyScaled = (annualizedScaled + 6n) / 12n
      return {
        amount: roundedMonthlyScaled.toString(),
        currency,
        scale: MONEY_SCALE,
      }
    })
}
