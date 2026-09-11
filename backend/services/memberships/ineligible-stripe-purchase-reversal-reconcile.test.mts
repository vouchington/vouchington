import { describe, expect, it } from 'vitest'
import { getObservedRemainingMinorUnits } from './ineligible-stripe-purchase-reversal-reconcile.mts'

describe('getObservedRemainingMinorUnits', () => {
  it('subtracts external refunds from the persisted prorated obligation', () => {
    expect(
      getObservedRemainingMinorUnits({ qualifyingAllocationMinorUnits: '500' }, 800, 200),
    ).toBe(300)
  })

  it('uses the live provider remainder until a qualifying obligation is persisted', () => {
    expect(getObservedRemainingMinorUnits({}, 800, 200)).toBe(800)
  })
})
