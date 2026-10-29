import { MONEY_SCALE, type CurrencyCode, type ScaledMoneyAggregate } from '@ts-shared/money'

export type MembershipRevenueRow = {
  tier: string
  interval: 'monthly' | 'yearly'
  currency_code: CurrencyCode
  minor_unit_exponent: number
  membership_count: number
  total_minor_units: string
}

export function calculateMembershipRevenue(membershipRows: readonly MembershipRevenueRow[]): {
  mrrByCurrency: ScaledMoneyAggregate[]
} {
  const amountsByCurrency = new Map<
    CurrencyCode,
    { monthly: bigint; yearly: bigint; minorUnitExponent: number }
  >()
  for (const row of membershipRows) {
    const current = amountsByCurrency.get(row.currency_code) ?? {
      monthly: 0n,
      yearly: 0n,
      minorUnitExponent: row.minor_unit_exponent,
    }
    current[row.interval] += BigInt(row.total_minor_units)
    amountsByCurrency.set(row.currency_code, current)
  }
  return {
    mrrByCurrency: calculateMrrByCurrency(amountsByCurrency),
  }
}
function calculateMrrByCurrency(
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
