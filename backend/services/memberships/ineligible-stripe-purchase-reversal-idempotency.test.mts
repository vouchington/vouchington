import { describe, expect, it } from 'vitest'
import {
  createIneligiblePurchaseReversalIdempotencyKey,
  createIneligiblePurchaseReversalRetryIdempotencyKey,
} from './ineligible-stripe-purchase-reversal-idempotency.mts'

describe('createIneligiblePurchaseReversalIdempotencyKey', () => {
  it('keeps a payment retry key stable when its remaining refundable amount changes', () => {
    const payment = {
      chargeId: 'ch_partial_refund',
      currency: 'usd',
      invoiceId: 'in_partial_refund',
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 1_000,
    }

    expect(
      createIneligiblePurchaseReversalIdempotencyKey(
        'production',
        'voucha-web',
        'sub_partial_refund',
        {
          ...payment,
          amountMinorUnits: 600,
        },
      ),
    ).toBe(
      createIneligiblePurchaseReversalIdempotencyKey(
        'production',
        'voucha-web',
        'sub_partial_refund',
        {
          ...payment,
          amountMinorUnits: 0,
        },
      ),
    )
  })

  it('separates invoice payments and provider target kinds without a legacy namespace', () => {
    const target = {
      amountMinorUnits: 100,
      chargeId: 'shared_id',
      currency: 'usd',
      invoiceId: 'in_first',
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 100,
    }
    const key = createIneligiblePurchaseReversalIdempotencyKey(
      'production',
      'voucha-web',
      'sub_invoice_targets',
      target,
    )

    expect(key).toMatch(/^voucha-membership-ineligible-reversal:/)
    expect(key).not.toContain('-v1:')
    expect(
      createIneligiblePurchaseReversalIdempotencyKey(
        'production',
        'voucha-web',
        'sub_invoice_targets',
        { ...target, invoiceId: 'in_second' },
      ),
    ).not.toBe(key)
    expect(
      createIneligiblePurchaseReversalIdempotencyKey(
        'production',
        'voucha-web',
        'sub_invoice_targets',
        { ...target, chargeId: null, paymentIntentId: 'shared_id' },
      ),
    ).not.toBe(key)
  })

  it('derives distinct retry keys from distinct provider refund identifiers', () => {
    const firstKey = createIneligiblePurchaseReversalRetryIdempotencyKey('re_first')

    expect(createIneligiblePurchaseReversalRetryIdempotencyKey('re_first')).toBe(firstKey)
    expect(createIneligiblePurchaseReversalRetryIdempotencyKey('re_second')).not.toBe(firstKey)
  })

  it('rejects targets without exactly one Stripe payment identifier', () => {
    const target = {
      amountMinorUnits: 100,
      chargeId: null,
      currency: 'usd',
      invoiceId: 'in_invalid_target',
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 100,
    }

    expect(() =>
      createIneligiblePurchaseReversalIdempotencyKey(
        'production',
        'voucha-web',
        'sub_invalid_target',
        target,
      ),
    ).toThrow('exactly one payment identifier')
    expect(() =>
      createIneligiblePurchaseReversalIdempotencyKey(
        'production',
        'voucha-web',
        'sub_invalid_target',
        {
          ...target,
          chargeId: 'ch_invalid_target',
          paymentIntentId: 'pi_invalid_target',
        },
      ),
    ).toThrow('exactly one payment identifier')
  })
})
