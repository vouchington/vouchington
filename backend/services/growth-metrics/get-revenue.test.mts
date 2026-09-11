import { describe, expect, it } from 'vitest'
import { MAX_MONEY_AMOUNT } from '@ts-shared/money'
import { calculateMembershipRevenue, calculateMrrByCurrency } from './get-revenue.mts'

describe('growth revenue arithmetic', () => {
  it('preserves the accepted maximum membership price after scale-six normalization', () => {
    expect(
      calculateMrrByCurrency(
        new Map([
          [
            'usd',
            {
              monthly: BigInt(MAX_MONEY_AMOUNT),
              yearly: 0n,
              minorUnitExponent: 2,
            },
          ],
        ]),
      ),
    ).toEqual([{ amount: '90071992547409910000', currency: 'usd', scale: 6 }])
  })

  it('preserves same-currency aggregates beyond a single valid maximum price', () => {
    expect(
      calculateMrrByCurrency(
        new Map([
          [
            'usd',
            {
              monthly: BigInt(MAX_MONEY_AMOUNT) * 2n,
              yearly: 0n,
              minorUnitExponent: 2,
            },
          ],
        ]),
      ),
    ).toEqual([{ amount: '180143985094819820000', currency: 'usd', scale: 6 }])
  })

  it('rounds yearly revenue half-up once without bounding an enormous aggregate', () => {
    const yearly = BigInt('99999999999999999999999999999999999999999999999999')
    const expected = ((yearly * 10_000n + 6n) / 12n).toString()

    expect(
      calculateMrrByCurrency(
        new Map([
          [
            'usd',
            {
              monthly: 0n,
              yearly,
              minorUnitExponent: 2,
            },
          ],
        ]),
      ),
    ).toEqual([{ amount: expected, currency: 'usd', scale: 6 }])
  })

  it('parses exact PostgreSQL aggregate strings without passing through Number', () => {
    expect(
      calculateMembershipRevenue([
        {
          tier: 'plus',
          interval: 'monthly',
          currency_code: 'usd',
          minor_unit_exponent: 2,
          membership_count: 2,
          total_minor_units: '99999999999999999999999999999999999999999999999999',
        },
      ]),
    ).toMatchObject({
      activeMemberships: 2,
      membershipsByTier: { plus: 2 },
      mrrByCurrency: [
        {
          amount: '999999999999999999999999999999999999999999999999990000',
          currency: 'usd',
          scale: 6,
        },
      ],
    })
  })
})
