import { describe, expect, it } from 'vitest'
import { getRefundableReversalTargets } from './ineligible-stripe-purchase-reversal-targets.mts'
import { getObservedStripeRefunds } from './ineligible-stripe-purchase-reversal/refund-history.mts'

describe('Stripe reversal dispute settlement', () => {
  it('counts a lost dispute toward the satisfied amount without counting a won dispute', async () => {
    const invoices = [
      {
        created: 1_893_456_000,
        currency: 'usd',
        id: 'in_dispute_settlement',
        payments: {
          data: [
            { amount_paid: 1_000, payment: { charge: 'ch_lost', type: 'charge' } },
            { amount_paid: 1_000, payment: { charge: 'ch_won', type: 'charge' } },
          ],
        },
        status: 'paid',
      },
    ]

    await expect(
      getRefundableReversalTargets(
        invoices,
        async () => ({ alreadyRefundedMinorUnits: 0, refundDeferred: false }),
        async target => ({
          lostDisputeAmountMinorUnits: target.chargeId === 'ch_lost' ? 600 : 0,
          refundDeferred: false,
        }),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        amountMinorUnits: 400,
        chargeId: 'ch_lost',
        externallySatisfiedMinorUnits: 600,
        qualifyingAmountMinorUnits: 1_000,
      }),
      expect.objectContaining({
        amountMinorUnits: 1_000,
        chargeId: 'ch_won',
        externallySatisfiedMinorUnits: 0,
        qualifyingAmountMinorUnits: 1_000,
      }),
    ])
  })

  it('caps combined refunds and lost disputes at the original payment capacity', async () => {
    await expect(
      getRefundableReversalTargets(
        [
          {
            created: 1_893_456_000,
            currency: 'usd',
            id: 'in_lost_dispute_capacity',
            payments: {
              data: [
                { amount_paid: 1_000, payment: { charge: 'ch_lost_capacity', type: 'charge' } },
              ],
            },
            status: 'paid',
          },
        ],
        async target =>
          getObservedStripeRefunds(
            [{ amount: 700, currency: 'usd', id: 're_existing', status: 'succeeded' }],
            target.currency,
          ),
        async () => ({ lostDisputeAmountMinorUnits: 700, refundDeferred: false }),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        amountMinorUnits: 0,
        externallySatisfiedMinorUnits: 1_000,
        qualifyingAmountMinorUnits: 1_000,
      }),
    ])
  })

  it('records a fully lost payment as completely externally satisfied', async () => {
    await expect(
      getRefundableReversalTargets(
        [
          {
            created: 1_893_456_000,
            currency: 'usd',
            id: 'in_fully_lost_dispute',
            payments: {
              data: [{ amount_paid: 1_000, payment: { charge: 'ch_fully_lost', type: 'charge' } }],
            },
            status: 'paid',
          },
        ],
        async () => ({ alreadyRefundedMinorUnits: 0, refundDeferred: false }),
        async () => ({ lostDisputeAmountMinorUnits: 1_000, refundDeferred: false }),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        amountMinorUnits: 0,
        externallySatisfiedMinorUnits: 1_000,
        qualifyingAmountMinorUnits: 1_000,
      }),
    ])
  })
})
