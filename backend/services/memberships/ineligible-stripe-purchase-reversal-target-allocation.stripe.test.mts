import { describe, expect, it } from 'vitest'
import { getQualifyingInvoiceLineAmount } from './ineligible-stripe-purchase-reversal-target-allocation.mts'
import { getRefundableReversalTargets } from './ineligible-stripe-purchase-reversal-targets.mts'
import { getObservedStripeRefunds } from './ineligible-stripe-purchase-reversal/refund-history.mts'

async function getNoStripeDisputeSettlement() {
  return { lostDisputeAmountMinorUnits: 0, refundDeferred: false }
}

describe('Stripe reversal qualifying allocation', () => {
  it('rejects missing or currency-mismatched hydrated qualifying lines', () => {
    expect(() =>
      getQualifyingInvoiceLineAmount(
        { created: 1, currency: 'usd', id: 'in_no_lines', status: 'paid' },
        'price_qualifying',
      ),
    ).toThrow('missing hydrated invoice lines')
    expect(() =>
      getQualifyingInvoiceLineAmount(
        {
          created: 1,
          currency: 'usd',
          id: 'in_wrong_currency',
          lines: { data: [{ amount: 1, currency: 'eur' }] },
          status: 'paid',
        },
        'price_qualifying',
      ),
    ).toThrow('line currency eur did not match usd')
    expect(() =>
      getQualifyingInvoiceLineAmount(
        {
          created: 1,
          currency: 'usd',
          id: 'in_unknown_tax_behavior',
          lines: {
            data: [
              {
                amount: 1,
                currency: 'usd',
                pricing: { price_details: { price: 'price_qualifying' } },
                taxes: [{ amount: 1, tax_behavior: 'future_behavior' }],
              },
            ],
          },
          status: 'paid',
        },
        'price_qualifying',
      ),
    ).toThrow('Unsupported Stripe invoice line tax behavior: future_behavior')
  })

  it('allocates only the matching price across mixed invoice payment targets', async () => {
    const invoice = {
      created: 1_893_456_000,
      currency: 'usd',
      id: 'in_mixed_prices',
      lines: {
        data: [
          {
            amount: 400,
            currency: 'usd',
            pricing: { price_details: { price: 'price_ineligible' } },
          },
          {
            amount: 600,
            currency: 'usd',
            pricing: { price_details: { price: 'price_unrelated' } },
          },
        ],
      },
      payments: {
        data: [
          { amount_paid: 250, payment: { type: 'charge', charge: 'ch_a' } },
          { amount_paid: 750, payment: { type: 'charge', charge: 'ch_b' } },
        ],
      },
      status: 'paid',
    }
    expect(getQualifyingInvoiceLineAmount(invoice, 'price_ineligible')).toBe(400)
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

  it('includes only exclusive tax from the matching line in the qualifying refund allocation', async () => {
    await expect(
      getRefundableReversalTargets(
        [
          {
            created: 1_893_456_000,
            currency: 'usd',
            id: 'in_qualifying_tax',
            lines: {
              data: [
                {
                  amount: 1_000,
                  currency: 'usd',
                  pricing: { price_details: { price: 'price_ineligible' } },
                  taxes: [
                    { amount: 100, tax_behavior: 'exclusive' },
                    { amount: 75, tax_behavior: 'inclusive' },
                  ],
                },
                {
                  amount: 500,
                  currency: 'usd',
                  pricing: { price_details: { price: 'price_unrelated' } },
                  taxes: [
                    { amount: 50, tax_behavior: 'exclusive' },
                    { amount: 25, tax_behavior: 'inclusive' },
                  ],
                },
              ],
            },
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
    await expect(
      getRefundableReversalTargets(
        [
          {
            created: 1_893_456_000,
            currency: 'usd',
            id: 'in_external_refund_capacity',
            lines: {
              data: [
                {
                  amount: 400,
                  currency: 'usd',
                  pricing: { price_details: { price: 'price_ineligible' } },
                },
              ],
            },
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
            ? getObservedStripeRefunds(
                [{ amount: 200, currency: 'usd', id: 're_external', status: 'succeeded' }],
                target.currency,
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
    await expect(
      getRefundableReversalTargets(
        [
          {
            created: 1_893_456_000,
            currency: 'usd',
            id: 'in_refund_other_target',
            lines: {
              data: [
                {
                  amount: 200,
                  currency: 'usd',
                  pricing: { price_details: { price: 'price_ineligible' } },
                },
              ],
            },
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
            ? getObservedStripeRefunds(
                [{ amount: 200, currency: 'usd', id: 're_other_target', status: 'succeeded' }],
                target.currency,
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
