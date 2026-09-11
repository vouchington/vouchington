import { describe, expect, it, vi } from 'vitest'
import { getInvoicePaymentTargets } from './ineligible-stripe-purchase-reversal-target-allocation.mts'
import {
  getInvoicesInReversalWindow,
  getRefundableReversalTargets,
} from './ineligible-stripe-purchase-reversal-targets.mts'
import { getObservedStripeRefunds } from './ineligible-stripe-purchase-reversal/refund-history.mts'

async function getNoStripeDisputeSettlement() {
  return { lostDisputeAmountMinorUnits: 0, refundDeferred: false }
}

describe('getInvoicesInReversalWindow', () => {
  it('selects only the exact originating invoice when provider state has advanced', () => {
    const invoice = (id: string, created: string) => ({
      created: new Date(created).getTime() / 1000,
      currency: 'usd',
      id,
      status: 'paid',
    })
    const invoices = [
      invoice('in_prior_period', '2029-12-31T23:59:59.000Z'),
      invoice('in_pre_binding', '2030-01-01T00:30:00.000Z'),
      invoice('in_originating', '2030-01-01T00:45:00.000Z'),
      invoice('in_current_binding', '2030-01-01T01:30:00.000Z'),
      invoice('in_next_period', '2030-02-01T00:00:00.000Z'),
    ]

    expect(
      getInvoicesInReversalWindow(invoices, {
        billingStartedAt: new Date('2030-01-01T00:00:00.000Z'),
        billingEndsAt: new Date('2030-01-01T00:30:00.000Z'),
        bindingBoundAt: new Date('2030-01-01T01:00:00.000Z'),
        bindingReleasedAt: null,
        originatingInvoiceId: 'in_originating',
      }).map(candidate => candidate.id),
    ).toEqual(['in_originating'])
  })

  it('intersects the current billing period with a rebound account window', () => {
    const invoice = (id: string, created: string) => ({
      created: new Date(created).getTime() / 1000,
      currency: 'usd',
      id,
      status: 'paid',
    })

    expect(
      getInvoicesInReversalWindow(
        [
          invoice('in_prior_period', '2029-12-31T23:59:59.000Z'),
          invoice('in_pre_binding', '2030-01-01T00:30:00.000Z'),
          invoice('in_current_binding', '2030-01-01T01:30:00.000Z'),
          invoice('in_next_period', '2030-02-01T00:00:00.000Z'),
        ],
        {
          billingStartedAt: new Date('2030-01-01T00:00:00.000Z'),
          billingEndsAt: new Date('2030-02-01T00:00:00.000Z'),
          bindingBoundAt: new Date('2030-01-01T01:00:00.000Z'),
          bindingReleasedAt: null,
          originatingInvoiceId: undefined,
        },
      ).map(candidate => candidate.id),
    ).toEqual(['in_current_binding'])
  })

  it('requires an exact originating invoice when Stripe omits the billing-period start', () => {
    const invoices = [
      { created: 1, currency: 'usd', id: 'in_historical', status: 'paid' },
      { created: 2, currency: 'usd', id: 'in_originating', status: 'paid' },
    ]

    expect(
      getInvoicesInReversalWindow(invoices, {
        billingStartedAt: undefined,
        billingEndsAt: undefined,
        bindingBoundAt: null,
        bindingReleasedAt: null,
        originatingInvoiceId: 'in_originating',
      }).map(candidate => candidate.id),
    ).toEqual(['in_originating'])
  })
})

describe('getRefundableReversalTargets', () => {
  it('rejects a paid Stripe invoice payment with no refundable provider reference', () => {
    expect(() =>
      getInvoicePaymentTargets({
        created: 1_893_456_000,
        currency: 'usd',
        id: 'in_missing_refund_target',
        payments: {
          data: [{ amount_paid: 1_000, payment: { type: 'card' } }],
        },
        status: 'paid',
      }),
    ).toThrow('paid payment without a refund target')
  })

  it('coalesces separate payments from an open invoice for the same Stripe charge', () => {
    expect(
      getInvoicePaymentTargets({
        created: 1_893_456_000,
        currency: 'usd',
        id: 'in_coalesced_charge',
        payments: {
          data: [
            {
              amount_paid: 400,
              payment: { type: 'charge', charge: { id: 'ch_coalesced' } },
            },
            {
              amount_paid: 600,
              payment: { type: 'charge', charge: 'ch_coalesced' },
            },
          ],
        },
        status: 'open',
      }),
    ).toEqual([
      {
        amountMinorUnits: 1_000,
        chargeId: 'ch_coalesced',
        currency: 'usd',
        invoiceId: 'in_coalesced_charge',
        paymentIntentId: null,
        qualifyingAmountMinorUnits: 1_000,
      },
    ])
  })

  it('rejects settled refunds denominated in another currency', async () => {
    await expect(
      getRefundableReversalTargets(
        [
          {
            created: 1_893_456_000,
            currency: 'usd',
            id: 'in_refund_currency_mismatch',
            payments: {
              data: [
                {
                  amount_paid: 1_000,
                  payment: { type: 'charge', charge: 'ch_refund_currency_mismatch' },
                },
              ],
            },
            status: 'paid',
          },
        ],
        async target =>
          getObservedStripeRefunds(
            [{ amount: 1_000, currency: 'eur', id: 're_eur', status: 'succeeded' }],
            target.currency,
          ),
      ),
    ).rejects.toThrow('Stripe refund currency eur did not match usd')
  })

  it('limits a reversal target to the payment amount not already refunded', async () => {
    const getStripeRefundHistoryForPayment =
      vi.fn<
        (options: {
          chargeId: string | null
          currency: string
          invoiceId: string
          paymentIntentId: string | null
        }) => Promise<{ alreadyRefundedMinorUnits: number; refundDeferred: boolean }>
      >()
    getStripeRefundHistoryForPayment.mockImplementation(async target =>
      getObservedStripeRefunds(
        [
          { amount: 400, currency: 'usd', id: 're_succeeded', status: 'succeeded' },
          { amount: 100, currency: 'usd', id: 're_failed', status: 'failed' },
        ],
        target.currency,
      ),
    )

    await expect(
      getRefundableReversalTargets(
        [
          {
            created: 1_893_456_000,
            currency: 'usd',
            id: 'in_partial_refund',
            payments: {
              data: [
                {
                  amount_paid: 1_000,
                  payment: { type: 'charge', charge: 'ch_partial_refund' },
                },
              ],
            },
            status: 'paid',
          },
        ],
        getStripeRefundHistoryForPayment,
        getNoStripeDisputeSettlement,
      ),
    ).resolves.toEqual([
      {
        amountMinorUnits: 600,
        chargeId: 'ch_partial_refund',
        currency: 'usd',
        externallySatisfiedMinorUnits: 400,
        invoiceId: 'in_partial_refund',
        paymentIntentId: null,
        providerObservedAmountMinorUnits: 600,
        qualifyingAmountMinorUnits: 1_000,
      },
    ])
    expect(getStripeRefundHistoryForPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        chargeId: 'ch_partial_refund',
        paymentIntentId: null,
      }),
    )
  })

  it('coalesces repeated payment allocations before reading the shared refund history', async () => {
    const getStripeRefundHistoryForPayment = vi
      .fn<
        (options: {
          chargeId: string | null
          currency: string
          invoiceId: string
          paymentIntentId: string | null
        }) => Promise<{ alreadyRefundedMinorUnits: number; refundDeferred: boolean }>
      >()
      .mockImplementation(async target =>
        getObservedStripeRefunds(
          [{ amount: 100, currency: 'usd', id: 're_shared', status: 'succeeded' }],
          target.currency,
        ),
      )

    await expect(
      getRefundableReversalTargets(
        [
          {
            created: 1_893_456_000,
            currency: 'usd',
            id: 'in_repeated_payment',
            payments: {
              data: [
                { amount_paid: 400, payment: { type: 'charge', charge: 'ch_repeated' } },
                { amount_paid: 600, payment: { type: 'charge', charge: 'ch_repeated' } },
              ],
            },
            status: 'paid',
          },
        ],
        getStripeRefundHistoryForPayment,
        getNoStripeDisputeSettlement,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        amountMinorUnits: 900,
        externallySatisfiedMinorUnits: 100,
        qualifyingAmountMinorUnits: 1_000,
      }),
    ])
    expect(getStripeRefundHistoryForPayment).toHaveBeenCalledTimes(1)
    expect(getStripeRefundHistoryForPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinorUnits: 1_000,
        chargeId: 'ch_repeated',
        paymentIntentId: null,
      }),
    )
  })
})
