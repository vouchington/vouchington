import { describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestIneligiblePurchaseReversal,
  getTestIneligiblePurchaseReversalExecutionClaimCount,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import { failIneligiblePurchaseReversal } from './ineligible-stripe-purchase-reversal-execution.mts'
import { claimIneligiblePurchaseReversals } from './ineligible-stripe-purchase-reversal/claim-ledger.mts'
import { reconcileRecordedIneligibleStripePurchaseReversal } from './reconcile-recorded-ineligible-stripe-purchase-reversal.mts'
import type { IneligibleStripePurchaseOperations } from './reverse-ineligible-stripe-purchase.mts'

describe('recorded ineligible Stripe purchase pending-refund reconciliation', () => {
  it('records fully observed refunds so a later reconciliation does not replay an expired idempotency key', async () => {
    const member = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_current_reconcile_observed_${member.id}`,
      providerEnvironment: 'production',
    })
    const incomingSku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_reconcile_observed_${member.id}`
    const invoiceId = `in_reconcile_observed_${member.id}`
    const target = {
      amountMinorUnits: 100,
      chargeId: `ch_reconcile_observed_${member.id}`,
      currency: 'usd',
      invoiceId,
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 100,
    }
    const initial = (await claimIneligiblePurchaseReversals(
      {
        customerId: `cus_reconcile_observed_${member.id}`,
        effectiveAt: undefined,
        expiresAt: undefined,
        incomingPlan: 'pro',
        incomingStatus: 'active',
        originatingInvoiceId: invoiceId,
        providerEnvironment: 'production',
        sku: incomingSku,
        stripePriceId: incomingSku.stripe_price_id,
        subscriptionId,
        userId: member.id,
      },
      [target],
      { currency: target.currency, qualifyingAmountMinorUnits: target.qualifyingAmountMinorUnits },
    ))!
    await Promise.all(
      [initial.cancellation!, initial.reversals[0]!].map(operation =>
        failIneligiblePurchaseReversal(operation, new Error('provider response was lost')),
      ),
    )
    const listSubscriptionInvoices = vi
      .fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>()
      .mockResolvedValue([
        {
          id: invoiceId,
          status: 'paid',
          amount_paid: target.amountMinorUnits,
          currency: target.currency,
          created: 1_893_369_600,
          description: null,
          payments: {
            data: [
              {
                amount_paid: target.amountMinorUnits,
                payment: { type: 'charge', charge: target.chargeId },
              },
            ],
          },
        },
      ] as never)
    const createRefund = vi.fn<IneligibleStripePurchaseOperations['createRefund']>()
    const operations = {
      cancelSubscriptionImmediately:
        vi.fn<IneligibleStripePurchaseOperations['cancelSubscriptionImmediately']>(),
      createRefund,
      getDisputeSettlementForPayment: vi
        .fn<NonNullable<IneligibleStripePurchaseOperations['getDisputeSettlementForPayment']>>()
        .mockResolvedValue({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
      listRefundsForPaymentPage: vi
        .fn<IneligibleStripePurchaseOperations['listRefundsForPaymentPage']>()
        .mockResolvedValue({
          hasMore: false,
          nextCursor: undefined,
          refunds: [
            {
              amount: target.amountMinorUnits,
              currency: target.currency,
              id: `re_reconcile_observed_${member.id}`,
              status: 'succeeded',
            },
          ],
        } as never),
      listSubscriptionInvoices,
    }

    await expect(
      reconcileRecordedIneligibleStripePurchaseReversal({
        originatingInvoiceId: invoiceId,
        providerEnvironment: 'production',
        operations,
      }),
    ).resolves.toBe(true)
    await expect(
      reconcileRecordedIneligibleStripePurchaseReversal({
        originatingInvoiceId: invoiceId,
        providerEnvironment: 'production',
        operations,
      }),
    ).resolves.toBe(true)
    expect(createRefund).not.toHaveBeenCalled()
    expect(listSubscriptionInvoices).toHaveBeenCalledTimes(2)
    await expect(
      getTestIneligiblePurchaseReversal(subscriptionId, 'production'),
    ).resolves.toMatchObject({
      provider_refund_id: null,
      receipt_amount_minor_units: '0',
      receipt_remaining_refundable_minor_units: '0',
    })
  })

  it('releases incomplete claims when Stripe returns a non-succeeded refund', async () => {
    const member = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_current_reconcile_invalid_${member.id}`,
      providerEnvironment: 'production',
    })
    const incomingSku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_reconcile_invalid_${member.id}`
    const invoiceId = `in_reconcile_invalid_${member.id}`
    const target = {
      amountMinorUnits: 100,
      chargeId: `ch_reconcile_invalid_${member.id}`,
      currency: 'usd',
      invoiceId,
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 100,
    }
    const initial = (await claimIneligiblePurchaseReversals(
      {
        customerId: `cus_reconcile_invalid_${member.id}`,
        effectiveAt: undefined,
        expiresAt: undefined,
        incomingPlan: 'pro',
        incomingStatus: 'active',
        originatingInvoiceId: invoiceId,
        providerEnvironment: 'production',
        sku: incomingSku,
        stripePriceId: incomingSku.stripe_price_id,
        subscriptionId,
        userId: member.id,
      },
      [target],
      { currency: target.currency, qualifyingAmountMinorUnits: target.qualifyingAmountMinorUnits },
    ))!
    await Promise.all(
      [initial.cancellation!, initial.reversals[0]!].map(operation =>
        failIneligiblePurchaseReversal(operation, new Error('simulate interrupted reversal')),
      ),
    )
    const listSubscriptionInvoices = vi
      .fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>()
      .mockResolvedValue([
        {
          id: invoiceId,
          status: 'paid',
          amount_paid: target.amountMinorUnits,
          currency: target.currency,
          created: 1_893_369_600,
          description: null,
          payments: {
            data: [
              {
                amount_paid: target.amountMinorUnits,
                payment: { type: 'charge', charge: target.chargeId },
              },
            ],
          },
        },
      ] as never)
    const createRefund = vi
      .fn<IneligibleStripePurchaseOperations['createRefund']>()
      .mockResolvedValue({
        amount: target.amountMinorUnits,
        currency: target.currency,
        id: `re_reconcile_invalid_${member.id}`,
        status: 'pending',
      } as never)

    await expect(
      reconcileRecordedIneligibleStripePurchaseReversal({
        originatingInvoiceId: invoiceId,
        providerEnvironment: 'production',
        operations: {
          cancelSubscriptionImmediately:
            vi.fn<IneligibleStripePurchaseOperations['cancelSubscriptionImmediately']>(),
          createRefund,
          getDisputeSettlementForPayment: vi
            .fn<NonNullable<IneligibleStripePurchaseOperations['getDisputeSettlementForPayment']>>()
            .mockResolvedValue({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
          listRefundsForPaymentPage: vi
            .fn<IneligibleStripePurchaseOperations['listRefundsForPaymentPage']>()
            .mockResolvedValue({ hasMore: false, nextCursor: undefined, refunds: [] }),
          listSubscriptionInvoices,
        },
      }),
    ).rejects.toThrow('refund is pending')
    await expect(
      getTestIneligiblePurchaseReversalExecutionClaimCount(subscriptionId, 'production'),
    ).resolves.toBe(0)
  })
})
