import { readTestStripeRefundHistory } from '@voucha/test-helpers/membership-reversal-case-fixtures'
import { createRefundScanCase } from '@voucha/test-helpers/services/memberships/refund-scan-case'
import { describe, expect, it } from 'vitest'
import { getRefundableReversalTargets } from './ineligible-stripe-purchase-reversal-targets.mts'

async function getNoStripeDisputeSettlement() {
  return { lostDisputeAmountMinorUnits: 0, refundDeferred: false }
}

describe('Stripe reversal payment targets', () => {
  it('allocates observed amounts across mixed invoice payments', async () => {
    const invoice = {
      created: 1_893_456_000,
      currency: 'usd',
      id: 'in_mixed_prices',
      payments: {
        data: [
          { amount_paid: 250, payment: { type: 'charge', charge: 'ch_a' } },
          { amount_paid: 750, payment: { type: 'charge', charge: 'ch_b' } },
        ],
      },
      status: 'paid',
    }
    await expect(
      getRefundableReversalTargets(
        [invoice],
        async () => ({ alreadyRefundedMinorUnits: 0, refundDeferred: false }),
        getNoStripeDisputeSettlement,
      ),
    ).resolves.toEqual([
      {
        amountMinorUnits: 250,
        chargeId: 'ch_a',
        currency: 'usd',
        externallySatisfiedMinorUnits: 0,
        invoiceId: 'in_mixed_prices',
        paymentIntentId: null,
        providerObservedAmountMinorUnits: 250,
        qualifyingAmountMinorUnits: 250,
      },
      {
        amountMinorUnits: 750,
        chargeId: 'ch_b',
        currency: 'usd',
        externallySatisfiedMinorUnits: 0,
        invoiceId: 'in_mixed_prices',
        paymentIntentId: null,
        providerObservedAmountMinorUnits: 750,
        qualifyingAmountMinorUnits: 750,
      },
    ])
  })
  it('uses a payment intent as the sole refund target when Stripe records one', async () => {
    await expect(
      getRefundableReversalTargets(
        [
          {
            created: 1_893_456_000,
            currency: 'usd',
            id: 'in_payment_intent_target',
            payments: {
              data: [
                {
                  amount_paid: 250,
                  payment: {
                    payment_intent: { id: 'pi_payment_intent_target' },
                    type: 'payment_intent',
                  },
                },
              ],
            },
            status: 'paid',
          },
        ],
        async () => ({ alreadyRefundedMinorUnits: 0, refundDeferred: false }),
        getNoStripeDisputeSettlement,
      ),
    ).resolves.toEqual([
      expect.objectContaining({ chargeId: null, paymentIntentId: 'pi_payment_intent_target' }),
    ])
  })
  it('keeps the observed paid amount as the refund allocation', async () => {
    await expect(
      getRefundableReversalTargets(
        [
          {
            created: 1_893_456_000,
            currency: 'usd',
            id: 'in_qualifying_tax',
            payments: {
              data: [
                { amount_paid: 1_675, payment: { charge: 'ch_qualifying_tax', type: 'charge' } },
              ],
            },
            status: 'paid',
          },
        ],
        async () => ({ alreadyRefundedMinorUnits: 0, refundDeferred: false }),
        getNoStripeDisputeSettlement,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        amountMinorUnits: 1_675,
        chargeId: 'ch_qualifying_tax',
        qualifyingAmountMinorUnits: 1_675,
      }),
    ])
  })
  it('keeps a completed refund local while the later fixed slice remains outstanding', async () => {
    const { reversalCaseId } = await createRefundScanCase()
    await expect(
      getRefundableReversalTargets(
        [
          {
            created: 1_893_456_000,
            currency: 'usd',
            id: 'in_external_refund_capacity',
            payments: {
              data: [
                { amount_paid: 200, payment: { type: 'charge', charge: 'ch_a' } },
                { amount_paid: 400, payment: { type: 'charge', charge: 'ch_b' } },
              ],
            },
            status: 'paid',
          },
        ],
        async target =>
          target.chargeId === 'ch_a'
            ? readTestStripeRefundHistory(
                [{ amount: 200, currency: 'usd', id: 're_external', status: 'succeeded' }],
                target,
                reversalCaseId,
              )
            : { alreadyRefundedMinorUnits: 0, refundDeferred: false },
        getNoStripeDisputeSettlement,
      ),
    ).resolves.toEqual([
      {
        amountMinorUnits: 0,
        chargeId: 'ch_a',
        currency: 'usd',
        externallySatisfiedMinorUnits: 200,
        invoiceId: 'in_external_refund_capacity',
        paymentIntentId: null,
        providerObservedAmountMinorUnits: 0,
        qualifyingAmountMinorUnits: 200,
      },
      {
        amountMinorUnits: 400,
        chargeId: 'ch_b',
        currency: 'usd',
        externallySatisfiedMinorUnits: 0,
        invoiceId: 'in_external_refund_capacity',
        paymentIntentId: null,
        providerObservedAmountMinorUnits: 400,
        qualifyingAmountMinorUnits: 400,
      },
    ])
  })
  it('keeps the fixed qualifying slice when a refund lands on another payment target', async () => {
    const { reversalCaseId } = await createRefundScanCase()
    await expect(
      getRefundableReversalTargets(
        [
          {
            created: 1_893_456_000,
            currency: 'usd',
            id: 'in_refund_other_target',
            payments: {
              data: [
                { amount_paid: 200, payment: { type: 'charge', charge: 'ch_first' } },
                { amount_paid: 400, payment: { type: 'charge', charge: 'ch_second' } },
              ],
            },
            status: 'paid',
          },
        ],
        async target =>
          target.chargeId === 'ch_second'
            ? readTestStripeRefundHistory(
                [{ amount: 200, currency: 'usd', id: 're_other_target', status: 'succeeded' }],
                target,
                reversalCaseId,
              )
            : { alreadyRefundedMinorUnits: 0, refundDeferred: false },
        getNoStripeDisputeSettlement,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        amountMinorUnits: 200,
        chargeId: 'ch_first',
        externallySatisfiedMinorUnits: 0,
        qualifyingAmountMinorUnits: 200,
      }),
      expect.objectContaining({
        amountMinorUnits: 200,
        chargeId: 'ch_second',
        externallySatisfiedMinorUnits: 200,
        qualifyingAmountMinorUnits: 400,
      }),
    ])
  })
})
