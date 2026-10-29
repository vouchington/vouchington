import { describe, expect, it, vi } from 'vitest'
import { MAX_MONEY_AMOUNT } from '@ts-shared/money'
import type { read } from '@data-stores/psql'

import { DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT } from '@services/memberships/create-types'
import { getRevenue } from './get-revenue.mts'

function revenueRow(interval: 'monthly' | 'yearly', totalMinorUnits: string, count = 1) {
  return {
    tier: 'plus',
    interval,
    currency_code: 'usd',
    minor_unit_exponent: 2,
    membership_count: count,
    total_minor_units: totalMinorUnits,
  }
}

async function revenueFor(membershipRows: ReturnType<typeof revenueRow>[]) {
  const mockRead = vi.fn<typeof read>().mockResolvedValueOnce({
    rows: [
      {
        active_membership_rows: [],
        membership_rows: membershipRows,
        upgrades: 0,
        downgrades: 0,
        cancellations: 0,
      },
    ],
  } as never)
  return getRevenue('30d', new Date(), undefined, DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT, {
    read: mockRead,
  })
}

describe('getRevenue arithmetic', () => {
  it('preserves the accepted maximum membership price after scale-six normalization', async () => {
    const result = await revenueFor([revenueRow('monthly', String(MAX_MONEY_AMOUNT))])

    expect(result.mrr_by_currency).toEqual([
      { amount: '90071992547409910000', currency: 'usd', scale: 6 },
    ])
  })

  it('preserves same-currency aggregates beyond a single valid maximum price', async () => {
    const result = await revenueFor([revenueRow('monthly', String(BigInt(MAX_MONEY_AMOUNT) * 2n))])

    expect(result.mrr_by_currency).toEqual([
      { amount: '180143985094819820000', currency: 'usd', scale: 6 },
    ])
  })

  it('rounds yearly revenue half-up once without bounding an enormous aggregate', async () => {
    const yearly = BigInt('99999999999999999999999999999999999999999999999999')
    const expected = ((yearly * 10_000n + 6n) / 12n).toString()

    const result = await revenueFor([revenueRow('yearly', yearly.toString())])

    expect(result.mrr_by_currency).toEqual([{ amount: expected, currency: 'usd', scale: 6 }])
  })

  it('parses exact PostgreSQL aggregate strings without passing through Number', async () => {
    const result = await revenueFor([
      revenueRow('monthly', '99999999999999999999999999999999999999999999999999', 2),
    ])

    expect(result.mrr_by_currency).toEqual([
      {
        amount: '999999999999999999999999999999999999999999999999990000',
        currency: 'usd',
        scale: 6,
      },
    ])
  })
})
