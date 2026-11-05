import { describe, expect, it } from 'vitest'
import { calculateIneligibleStripePurchaseRefundCap } from './case-creation.mts'

describe('ineligible Stripe purchase refund cap', () => {
  const start = new Date('2026-01-01T00:00:00.000Z')
  const end = new Date('2026-01-01T00:00:10.000Z')

  it.each([
    ['already covered', new Date('2025-12-31T23:59:59.000Z'), 1001],
    ['covered at the start', start, 1001],
    ['partial overlap rounded down', new Date('2026-01-01T00:00:03.000Z'), 700],
    ['no overlap at the end', end, 0],
    ['no overlap after the end', new Date('2026-01-01T00:00:11.000Z'), 0],
  ])('%s', (_label, collision, expected) => {
    expect(calculateIneligibleStripePurchaseRefundCap(1001, start, end, collision)).toBe(expected)
  })

  it('uses the full qualifying amount for a zero-length period', () => {
    expect(calculateIneligibleStripePurchaseRefundCap(1001, start, start, start)).toBe(1001)
  })

  it('preserves integer precision for large minor-unit amounts', () => {
    expect(
      calculateIneligibleStripePurchaseRefundCap(
        Number.MAX_SAFE_INTEGER,
        start,
        end,
        new Date('2026-01-01T00:00:03.000Z'),
      ),
    ).toBe(6305039478318693)
  })
})
