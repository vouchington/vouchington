import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createTestFamilyMembership, createTestSku, createTestUser } from '@voucha/test-helpers'
import { getIneligiblePurchaseReversalCase } from './ineligible-stripe-purchase-reversal/case-read.mts'
import { StripeRefundScanContinuationError } from './ineligible-stripe-purchase-reversal/refund-scan.mts'
import { reconcileRecordedIneligibleStripePurchaseReversal } from './reconcile-recorded-ineligible-stripe-purchase-reversal.mts'
import {
  reverseIneligibleStripePurchase,
  type IneligibleStripePurchaseOperations,
} from './reverse-ineligible-stripe-purchase.mts'

describe('ineligible Stripe purchase refund pagination', () => {
  it('commits the reversal case and resumes more than 1,000 refunds after the call budget', async () => {
    const { operations, purchase } = await createFixture()
    operations.listRefundsForPaymentPage.mockImplementation(async ({ startingAfter }) => {
      const pageIndex = startingAfter ? Number(startingAfter.split('_')[2]) + 1 : 0
      const refunds = Array.from({ length: 100 }, (_, refundIndex) => ({
        amount: 1,
        currency: 'usd',
        id: `re_page_${pageIndex}_${refundIndex}`,
        status: 'succeeded',
      }))
      return {
        hasMore: pageIndex < 10,
        nextCursor: pageIndex < 10 ? refunds.at(-1)!.id : undefined,
        refunds,
      } as never
    })

    await expect(
      reverseIneligibleStripePurchase({ ...purchase, operations }),
    ).rejects.toBeInstanceOf(StripeRefundScanContinuationError)
    expect(operations.listRefundsForPaymentPage).toHaveBeenCalledTimes(10)
    await expect(
      getIneligiblePurchaseReversalCase({
        originatingInvoiceId: purchase.originatingInvoiceId,
        providerEnvironment: purchase.providerEnvironment,
      }),
    ).resolves.toMatchObject({ subscriptionId: purchase.subscriptionId })
    expect(operations.cancelSubscriptionImmediately).not.toHaveBeenCalled()
    expect(operations.createRefund).not.toHaveBeenCalled()

    operations.createRefund.mockResolvedValue({
      amount: 900,
      currency: 'usd',
      id: `re_resumed_${randomUUID()}`,
      status: 'succeeded',
    } as never)
    await expect(
      reconcileRecordedIneligibleStripePurchaseReversal({
        operations,
        originatingInvoiceId: purchase.originatingInvoiceId,
        providerEnvironment: purchase.providerEnvironment,
      }),
    ).resolves.toBe(true)
    expect(operations.listRefundsForPaymentPage).toHaveBeenCalledTimes(12)
    expect(operations.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinorUnits: 900 }),
    )
  })
})

async function createFixture() {
  const user = await createTestUser()
  const familySku = await createTestSku({ plan: 'pro' })
  const incomingSku = await createTestSku({ plan: 'plus' })
  await createTestFamilyMembership({
    applicationId: familySku.provider_application_id,
    effectiveAt: new Date(Date.now() - 60_000),
    expiresAt: new Date(Date.now() + 60_000),
    membershipProductId: familySku.id,
    membershipProviderProductId: familySku.membership_provider_product_id,
    userId: user.id,
  })
  const suffix = randomUUID()
  const purchase = {
    customerId: `cus_refund_pages_${suffix}`,
    effectiveAt: new Date(Date.now() - 30_000),
    expiresAt: new Date(Date.now() + 30_000),
    incomingPlan: 'plus' as const,
    incomingStatus: 'active' as const,
    originatingInvoiceId: `in_refund_pages_${suffix}`,
    providerEnvironment: 'test' as const,
    sku: { id: incomingSku.id },
    stripePriceId: incomingSku.stripe_price_id,
    subscriptionId: `sub_refund_pages_${suffix}`,
    userId: user.id,
  }
  const operations = createOperations()
  operations.listSubscriptionInvoices.mockResolvedValue([
    {
      created: Math.floor(Date.now() / 1_000),
      currency: 'usd',
      id: purchase.originatingInvoiceId,
      lines: {
        data: [
          {
            amount: 2_000,
            currency: 'usd',
            pricing: { price_details: { price: purchase.stripePriceId } },
          },
        ],
      },
      payments: {
        data: [
          {
            amount_paid: 2_000,
            payment: { charge: `ch_refund_pages_${suffix}`, type: 'charge' },
          },
        ],
      },
      status: 'paid',
    },
  ] as never)
  return { operations, purchase }
}

function createOperations() {
  return {
    cancelSubscriptionImmediately:
      vi.fn<IneligibleStripePurchaseOperations['cancelSubscriptionImmediately']>(),
    createRefund: vi.fn<IneligibleStripePurchaseOperations['createRefund']>(),
    getDisputeSettlementForPayment: vi
      .fn<NonNullable<IneligibleStripePurchaseOperations['getDisputeSettlementForPayment']>>()
      .mockResolvedValue({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
    listRefundsForPaymentPage:
      vi.fn<IneligibleStripePurchaseOperations['listRefundsForPaymentPage']>(),
    listSubscriptionInvoices:
      vi.fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>(),
    retrieveRefund: vi.fn<NonNullable<IneligibleStripePurchaseOperations['retrieveRefund']>>(),
  }
}
