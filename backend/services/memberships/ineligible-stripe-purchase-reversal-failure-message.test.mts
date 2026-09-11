import { describe, expect, it } from 'vitest'
import { getIneligiblePurchaseReversalFailureMessage } from './ineligible-stripe-purchase-reversal-failure-message.mts'

describe('ineligible purchase reversal failure messages', () => {
  it('bounds non-Error failures before persistence', () => {
    expect(getIneligiblePurchaseReversalFailureMessage('x'.repeat(2_001))).toBe('x'.repeat(2_000))
  })

  it('provides a nonempty message for an Error without one', () => {
    expect(getIneligiblePurchaseReversalFailureMessage(new Error())).toBe(
      'Unknown provider failure',
    )
  })
})
