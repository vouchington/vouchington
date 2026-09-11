import { describe, expect, it } from 'vitest'
import { getRefundableReversalTargets } from './ineligible-stripe-purchase-reversal-targets.mts'
import { getObservedStripeRefunds } from './ineligible-stripe-purchase-reversal/refund-history.mts'

describe('getRefundableReversalTargets pending refunds', () => {
  it.each(['pending', null, 'future_status'] as const)(
    'defers while Stripe refund status is %s',
    async status => {
      await expect(
        getRefundableReversalTargets(
          [
            {
              created: 1_893_456_000,
              currency: 'usd',
              id: 'in_pending_refund',
              payments: {
                data: [
                  {
                    amount_paid: 1_000,
                    payment: { type: 'charge', charge: 'ch_pending_refund' },
                  },
                ],
              },
              status: 'paid',
            },
          ],
          async target =>
            getObservedStripeRefunds(
              [{ amount: 1_000, currency: 'usd', id: 're_unsettled', status }],
              target.currency,
            ),
          async () => ({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
        ),
      ).resolves.toEqual([
        expect.objectContaining({
          amountMinorUnits: 1_000,
          chargeId: 'ch_pending_refund',
          qualifyingAmountMinorUnits: 1_000,
          refundDeferred: true,
        }),
      ])
    },
  )

  it('rejects a pending refund denominated in another currency before deferring', async () => {
    await expect(
      getRefundableReversalTargets(
        [
          {
            created: 1_893_456_000,
            currency: 'usd',
            id: 'in_pending_refund_currency_mismatch',
            payments: {
              data: [
                {
                  amount_paid: 1_000,
                  payment: { type: 'charge', charge: 'ch_pending_refund_currency_mismatch' },
                },
              ],
            },
            status: 'paid',
          },
        ],
        async target =>
          getObservedStripeRefunds(
            [{ amount: 1_000, currency: 'eur', id: 're_pending_eur', status: 'pending' }],
            target.currency,
          ),
        async () => ({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
      ),
    ).rejects.toThrow('Stripe refund currency eur did not match usd')
  })
})
