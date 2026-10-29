import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { GrowthRange, Revenue } from './types.mts'
import { calculateMembershipRevenue, type MembershipRevenueRow } from './revenue-arithmetic.mts'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'

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
