import { describe, expect, it, vi } from 'vitest'
import {
  createTestSku,
  createTestUser,
  getTestIneligiblePurchaseReversalExecutionClaimCount,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import { failIneligiblePurchaseReversal } from './ineligible-stripe-purchase-reversal-execution.mts'
import { claimIneligiblePurchaseReversals } from './ineligible-stripe-purchase-reversal/claim-ledger.mts'
import { reconcileRecordedIneligibleStripePurchaseReversal } from './reconcile-recorded-ineligible-stripe-purchase-reversal.mts'
import type { IneligibleStripePurchaseOperations } from './reverse-ineligible-stripe-purchase.mts'

describe('recorded ineligible Stripe purchase reconciliation concurrency', () => {
  it('drains concurrent refunds before releasing failed claims', async () => {
    const member = await createTestUser()
    const currentSku = await createTestSku({ plan: 'plus' })
    await createMembership({
      userId: member.id,
      plan: 'plus',
      skuId: currentSku.id,
      stripeSubscriptionId: `sub_current_reconcile_bounded_${member.id}`,
      providerEnvironment: 'production',
    })
    const incomingSku = await createTestSku({ plan: 'pro' })
    const subscriptionId = `sub_reconcile_bounded_${member.id}`
    const invoiceId = `in_reconcile_bounded_${member.id}`
    const targets = Array.from({ length: 4 }, (_, index) => ({
      amountMinorUnits: 100,
      chargeId: `ch_reconcile_bounded_${member.id}_${index}`,
      currency: 'usd',
      invoiceId,
      paymentIntentId: null,
      qualifyingAmountMinorUnits: 100,
    }))
    const initial = (await claimIneligiblePurchaseReversals(
      {
        customerId: `cus_reconcile_bounded_${member.id}`,
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
      targets,
      { currency: targets[0]!.currency, qualifyingAmountMinorUnits: 400 },
    ))!
    await Promise.all(
      [initial.cancellation!, ...initial.reversals].map(operation =>
        failIneligiblePurchaseReversal(operation, new Error('simulate interrupted reversal')),
      ),
    )
    const cancelSubscriptionImmediately =
      vi.fn<IneligibleStripePurchaseOperations['cancelSubscriptionImmediately']>()
    const listSubscriptionInvoices =
      vi.fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>()
    const listRefundsForPaymentPage =
      vi.fn<IneligibleStripePurchaseOperations['listRefundsForPaymentPage']>()
    const releaseRefunds: (() => void)[] = []
    let activeRefunds = 0
    let maxActiveRefunds = 0
    let failedRefund = false
    let signalSiblingsInFlight: (() => void) | undefined
    const siblingsInFlight = new Promise<void>(resolve => {
      signalSiblingsInFlight = resolve
    })
    const createRefund = vi
      .fn<IneligibleStripePurchaseOperations['createRefund']>()
      .mockImplementation(async options => {
        if (options.chargeId === targets[0]!.chargeId) {
          failedRefund = true
          throw new Error('Stripe rejected the first refund')
        }
        activeRefunds += 1
        maxActiveRefunds = Math.max(maxActiveRefunds, activeRefunds)
        if (activeRefunds === 3) signalSiblingsInFlight?.()
        await new Promise<void>(resolve => {
          releaseRefunds.push(resolve)
        })
        activeRefunds -= 1
        return {
          id: `re_reconcile_bounded_${options.chargeId}`,
          amount: options.amountMinorUnits,
          currency: 'usd',
          status: 'succeeded',
        } as never
      })
    listSubscriptionInvoices.mockResolvedValue([
      {
        id: invoiceId,
        status: 'paid',
        amount_paid: 400,
        currency: 'usd',
        created: 1_893_369_600,
        description: null,
        payments: {
          data: targets.map(target => ({
            amount_paid: target.amountMinorUnits,
            payment: { type: 'charge', charge: target.chargeId },
          })),
        },
      },
    ] as never)
    listRefundsForPaymentPage.mockResolvedValue({
      hasMore: false,
      nextCursor: undefined,
      refunds: [],
    })
    const reconcileOutcome = reconcileRecordedIneligibleStripePurchaseReversal({
      originatingInvoiceId: invoiceId,
      providerEnvironment: 'production',
      operations: {
        cancelSubscriptionImmediately,
        createRefund,
        getDisputeSettlementForPayment: vi
          .fn<NonNullable<IneligibleStripePurchaseOperations['getDisputeSettlementForPayment']>>()
          .mockResolvedValue({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
        listSubscriptionInvoices,
        listRefundsForPaymentPage,
      },
    }).then(
      () => null,
      (error: Error) => error,
    )

    await siblingsInFlight
    expect(failedRefund).toBe(true)
    expect(createRefund).toHaveBeenCalledTimes(4)
    expect(maxActiveRefunds).toBe(3)
    await expect(
      getTestIneligiblePurchaseReversalExecutionClaimCount(subscriptionId, 'production'),
    ).resolves.toBe(4)

    for (const releaseRefund of releaseRefunds.splice(0)) releaseRefund()
    await expect(reconcileOutcome).resolves.toMatchObject({
      message: 'Stripe rejected the first refund',
    })
    await expect(
      getTestIneligiblePurchaseReversalExecutionClaimCount(subscriptionId, 'production'),
    ).resolves.toBe(0)
  })
})
