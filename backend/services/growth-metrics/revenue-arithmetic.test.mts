import { describe, expect, it } from 'vitest'
import { MAX_MONEY_AMOUNT } from '@ts-shared/money'
import { calculateMembershipRevenue, type MembershipRevenueRow } from './revenue-arithmetic.mts'

function revenueRow(
  interval: MembershipRevenueRow['interval'],
  totalMinorUnits: string,
  count = 1,
): MembershipRevenueRow {
  return {
    tier: 'plus',
    interval,
    currency_code: 'usd',
    minor_unit_exponent: 2,
    membership_count: count,
    total_minor_units: totalMinorUnits,
  }
}

describe('growth revenue arithmetic', () => {
  it('preserves the accepted maximum membership price after scale-six normalization', () => {
    expect(
      calculateMembershipRevenue([revenueRow('monthly', String(MAX_MONEY_AMOUNT))]).mrrByCurrency,
    ).toEqual([{ amount: '90071992547409910000', currency: 'usd', scale: 6 }])
  })

  it('preserves same-currency aggregates beyond a single valid maximum price', () => {
    expect(
      calculateMembershipRevenue([revenueRow('monthly', String(BigInt(MAX_MONEY_AMOUNT) * 2n))])
        .mrrByCurrency,
    ).toEqual([{ amount: '180143985094819820000', currency: 'usd', scale: 6 }])
  })

  it('rounds yearly revenue half-up once without bounding an enormous aggregate', () => {
    const yearly = BigInt('99999999999999999999999999999999999999999999999999')
    const expected = ((yearly * 10_000n + 6n) / 12n).toString()

    expect(
      calculateMembershipRevenue([revenueRow('yearly', yearly.toString())]).mrrByCurrency,
    ).toEqual([{ amount: expected, currency: 'usd', scale: 6 }])
  })

  it('parses exact PostgreSQL aggregate strings without passing through Number', () => {
    expect(
      calculateMembershipRevenue([
        revenueRow('monthly', '99999999999999999999999999999999999999999999999999', 2),
      ]).mrrByCurrency,
    ).toEqual([
      {
        amount: '999999999999999999999999999999999999999999999999990000',
        currency: 'usd',
        scale: 6,
      },
    ])
  })
})
