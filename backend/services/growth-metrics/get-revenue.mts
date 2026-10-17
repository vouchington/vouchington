import { read } from '@data-stores/psql'
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
  range: GrowthRange,
  _periodStart: Date,
  scope?: RevenueScope,
  context: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<Revenue> {
  const scopeIds = scope?.userIds ?? ['00000000-0000-0000-0000-000000000000']
  const { rows } = await read<RevenueQueryRow>(sql`/* getRevenue */
    WITH active_membership_counts AS (
      SELECT tier, SUM(membership_count)::INT AS membership_count
      FROM mv_revenue_memberships
      WHERE scope_id = ANY(${scopeIds}::text[])
        AND application_id = ''
      GROUP BY tier
    ),
    membership_revenue AS (
      SELECT
        tier, interval, currency_code, minor_unit_exponent,
        SUM(membership_count)::INT AS membership_count,
        SUM(total_minor_units)::TEXT AS total_minor_units
      FROM mv_revenue_memberships
      WHERE scope_id = ANY(${scopeIds}::text[])
        AND application_id = ${context.applicationId}
      GROUP BY tier, interval, currency_code, minor_unit_exponent
    ),
    change_counts AS (
      SELECT
        COALESCE(SUM(upgrades), 0)::INT AS upgrades,
        COALESCE(SUM(downgrades), 0)::INT AS downgrades,
        COALESCE(SUM(cancellations), 0)::INT AS cancellations
      FROM mv_revenue_changes
      WHERE window_name = ${range}
        AND scope_id = ANY(${scopeIds}::text[])
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
    .toSorted(([left], [right]) => left.localeCompare(right))
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
