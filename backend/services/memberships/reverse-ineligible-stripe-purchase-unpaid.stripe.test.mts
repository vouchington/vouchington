import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestIneligiblePurchaseReversalCase,
  getTestIneligiblePurchaseReversal,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import { reconcileRecordedIneligibleStripePurchaseReversal } from './reconcile-recorded-ineligible-stripe-purchase-reversal.mts'
import {
  reverseIneligibleStripePurchase,
  type IneligibleStripePurchaseOperations,
} from './reverse-ineligible-stripe-purchase.mts'

describe('reverseIneligibleStripePurchase unpaid invoice', () => {
  it('cancels an ineligible subscription without recording a terminal refund operation', async () => {
    const user = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      providerEnvironment: 'production',
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_unpaid_current_${randomUUID()}`,
      userId: user.id,
    })
    const incomingSku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_unpaid_${randomUUID()}`
    const invoiceId = `in_unpaid_${randomUUID()}`
    const cancelSubscriptionImmediately =
      vi.fn<IneligibleStripePurchaseOperations['cancelSubscriptionImmediately']>()
    const createRefund = vi.fn<IneligibleStripePurchaseOperations['createRefund']>()

    await expect(
      reverseIneligibleStripePurchase({
        customerId: `cus_unpaid_${randomUUID()}`,
        effectiveAt: undefined,
        expiresAt: undefined,
        incomingPlan: 'pro',
        incomingStatus: 'active',
        originatingInvoiceId: invoiceId,
        operations: {
          cancelSubscriptionImmediately,
          createRefund,
          getDisputeSettlementForPayment: vi
            .fn<NonNullable<IneligibleStripePurchaseOperations['getDisputeSettlementForPayment']>>()
            .mockResolvedValue({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
          listRefundsForPaymentPage: vi
            .fn<IneligibleStripePurchaseOperations['listRefundsForPaymentPage']>()
            .mockResolvedValue({ hasMore: false, nextCursor: undefined, refunds: [] }),
          listSubscriptionInvoices: vi
            .fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>()
            .mockResolvedValue([
              {
                created: 1_893_369_600,
                currency: 'usd',
                id: invoiceId,
                lines: {
                  data: [
                    {
                      amount: 0,
                      currency: 'usd',
                      pricing: { price_details: { price: incomingSku.stripe_price_id } },
                    },
                  ],
                },
                payments: { data: [] },
                status: 'open',
              },
            ] as never),
        },
        providerEnvironment: 'production',
        sku: incomingSku,
        stripePriceId: incomingSku.stripe_price_id,
        subscriptionId,
        userId: user.id,
      }),
    ).resolves.toBe(true)

    expect(cancelSubscriptionImmediately).toHaveBeenCalledOnce()
    expect(createRefund).not.toHaveBeenCalled()
    await expect(
      getTestIneligiblePurchaseReversal(subscriptionId, 'production'),
    ).resolves.toBeNull()
    await expect(
      getTestIneligiblePurchaseReversalCase(subscriptionId, 'production'),
    ).resolves.toEqual({
      currency_code: 'usd',
      qualifying_amount_minor_units: '0',
      refund_cap_minor_units: '0',
      stripe_price_id: incomingSku.stripe_price_id,
    })
  })

  it('allocates a later payment from the original unpaid invoice cap', async () => {
    const user = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      providerEnvironment: 'production',
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_later_payment_current_${randomUUID()}`,
      userId: user.id,
    })
    const incomingSku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_later_payment_${randomUUID()}`
    const invoiceId = `in_later_payment_${randomUUID()}`
    await reverseIneligibleStripePurchase({
      customerId: `cus_later_payment_${randomUUID()}`,
      effectiveAt: undefined,
      expiresAt: undefined,
      incomingPlan: 'pro',
      incomingStatus: 'active',
      originatingInvoiceId: invoiceId,
      operations: unpaidOperations(invoiceId, incomingSku.stripe_price_id, 1_000),
      providerEnvironment: 'production',
      sku: incomingSku,
      stripePriceId: incomingSku.stripe_price_id,
      subscriptionId,
      userId: user.id,
    })

    const chargeId = `ch_later_payment_${randomUUID()}`
    const createRefund = vi
      .fn<IneligibleStripePurchaseOperations['createRefund']>()
      .mockResolvedValue({
        amount: 1_000,
        currency: 'usd',
        id: `re_later_payment_${randomUUID()}`,
        status: 'succeeded',
      } as never)
    const operations = paidOperations(invoiceId, chargeId, createRefund)
    const reconcile = () =>
      reconcileRecordedIneligibleStripePurchaseReversal({
        originatingInvoiceId: invoiceId,
        providerEnvironment: 'production',
        operations,
      })

    await expect(reconcile()).resolves.toBe(true)
    await expect(reconcile()).resolves.toBe(true)

    expect(createRefund).toHaveBeenCalledOnce()
    expect(createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinorUnits: 1_000, chargeId }),
    )
    await expect(
      getTestIneligiblePurchaseReversal(subscriptionId, 'production'),
    ).resolves.toMatchObject({
      amount_minor_units: '1000',
      completed_at: expect.any(Date),
      qualifying_amount_minor_units: '1000',
    })
  })
})

function paidOperations(
  invoiceId: string,
  chargeId: string,
  createRefund: IneligibleStripePurchaseOperations['createRefund'],
): IneligibleStripePurchaseOperations {
  return {
    cancelSubscriptionImmediately:
      vi.fn<IneligibleStripePurchaseOperations['cancelSubscriptionImmediately']>(),
    createRefund,
    getDisputeSettlementForPayment: vi
      .fn<NonNullable<IneligibleStripePurchaseOperations['getDisputeSettlementForPayment']>>()
      .mockResolvedValue({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
    listRefundsForPaymentPage: vi
      .fn<IneligibleStripePurchaseOperations['listRefundsForPaymentPage']>()
      .mockResolvedValue({ hasMore: false, nextCursor: undefined, refunds: [] }),
    listSubscriptionInvoices: vi
      .fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>()
      .mockResolvedValue([
        {
          created: 1_893_369_600,
          currency: 'usd',
          id: invoiceId,
          payments: {
            data: [{ amount_paid: 1_000, payment: { charge: chargeId, type: 'charge' } }],
          },
          status: 'paid',
        },
      ] as never),
  }
}

function unpaidOperations(
  invoiceId: string,
  stripePriceId: string,
  amountMinorUnits: number,
): IneligibleStripePurchaseOperations {
  return {
    cancelSubscriptionImmediately:
      vi.fn<IneligibleStripePurchaseOperations['cancelSubscriptionImmediately']>(),
    createRefund: vi.fn<IneligibleStripePurchaseOperations['createRefund']>(),
    getDisputeSettlementForPayment: vi
      .fn<NonNullable<IneligibleStripePurchaseOperations['getDisputeSettlementForPayment']>>()
      .mockResolvedValue({
        lostDisputeAmountMinorUnits: 0,
        refundDeferred: false,
      }),
    listRefundsForPaymentPage: vi
      .fn<IneligibleStripePurchaseOperations['listRefundsForPaymentPage']>()
      .mockResolvedValue({ hasMore: false, nextCursor: undefined, refunds: [] }),
    listSubscriptionInvoices: vi
      .fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>()
      .mockResolvedValue([
        {
          created: 1_893_369_600,
          currency: 'usd',
          id: invoiceId,
          lines: {
            data: [
              {
                amount: amountMinorUnits,
                currency: 'usd',
                pricing: { price_details: { price: stripePriceId } },
              },
            ],
          },
          payments: { data: [] },
          status: 'open',
        },
      ] as never),
  }
}
