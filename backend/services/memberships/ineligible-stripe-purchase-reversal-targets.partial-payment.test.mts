import { describe, expect, it } from 'vitest'
import { getRefundableReversalTargets } from './ineligible-stripe-purchase-reversal-targets.mts'

describe('getRefundableReversalTargets partial invoice payments', () => {
  it('uses a successful payment allocation from an open invoice instead of recording a zero target', async () => {
    await expect(
      getRefundableReversalTargets(
        [
          {
            created: 1_893_456_000,
            currency: 'usd',
            id: 'in_open_partial_payment',
            lines: {
              data: [
                {
                  amount: 1_000,
                  currency: 'usd',
                  pricing: { price_details: { price: 'price_partial_payment' } },
                },
              ],
            },
            payments: {
              data: [
                {
                  amount_paid: 400,
                  payment: { type: 'charge', charge: 'ch_open_partial_payment' },
                },
              ],
            },
            status: 'open',
          },
        ],
        async () => ({ alreadyRefundedMinorUnits: 0, refundDeferred: false }),
        async () => ({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        amountMinorUnits: 400,
        chargeId: 'ch_open_partial_payment',
        qualifyingAmountMinorUnits: 400,
      }),
    ])
  })
})
