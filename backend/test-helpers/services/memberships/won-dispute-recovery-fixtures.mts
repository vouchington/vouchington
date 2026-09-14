import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import { createTestSku, createTestUser } from '@voucha/test-helpers'
import { createMembership } from '../../../services/memberships/create.mts'
import { claimIneligiblePurchaseReversals } from '../../../services/memberships/ineligible-stripe-purchase-reversal/claim-ledger.mts'
import {
  completeIneligiblePurchaseReversal,
  markIneligiblePurchaseReversalCompleted,
} from '../../../services/memberships/ineligible-stripe-purchase-reversal-execution.mts'
import type { IneligibleStripePurchaseOperations } from '../../../services/memberships/reverse-ineligible-stripe-purchase.mts'

type WonDisputeRecoveryOperations = IneligibleStripePurchaseOperations & {
  getWonStripeDisputeInvoice: (
    disputeId: string,
  ) => Promise<{ chargeId: string; invoiceIds: string[]; paymentIntentId: string } | null>
}

export async function createWonDisputeRecoveryFixture(
  initialRefundedMinorUnits = 0,
  targetAmountsMinorUnits = [1_000],
) {
  const user = await createTestUser()
  const currentSku = await createTestSku({ plan: 'plus' })
  await createMembership({
    userId: user.id,
    plan: 'plus',
    providerEnvironment: 'production',
    skuId: currentSku.id,
    stripeSubscriptionId: `sub_won_dispute_current_${randomUUID()}`,
  })
  const sku = await createTestSku({ plan: 'pro' })
  const amountMinorUnits = targetAmountsMinorUnits.reduce((total, amount) => total + amount, 0)
  const subscriptionId = `sub_won_dispute_${randomUUID()}`
  const invoiceId = `in_won_dispute_${randomUUID()}`
  const chargeIds = targetAmountsMinorUnits.map(() => `ch_won_dispute_${randomUUID()}`)
  const paymentIntentIds = targetAmountsMinorUnits.map(
    (_, index) => `pi_won_dispute_${index}_${subscriptionId}`,
  )
  const claim = (await claimIneligiblePurchaseReversals(
    {
      customerId: `cus_won_dispute_${randomUUID()}`,
      effectiveAt: undefined,
      expiresAt: undefined,
      incomingPlan: 'pro',
      incomingStatus: 'active',
      originatingInvoiceId: invoiceId,
      providerEnvironment: 'production',
      sku,
      stripePriceId: sku.stripe_price_id,
      subscriptionId,
      userId: user.id,
    },
    targetAmountsMinorUnits.map((targetAmountMinorUnits, index) => ({
      chargeId: null,
      currency: 'usd',
      amountMinorUnits: index === 0 ? initialRefundedMinorUnits : 0,
      externallySatisfiedMinorUnits:
        targetAmountMinorUnits - (index === 0 ? initialRefundedMinorUnits : 0),
      invoiceId,
      paymentIntentId: paymentIntentIds[index]!,
      qualifyingAmountMinorUnits: targetAmountMinorUnits,
    })),
    { currency: 'usd', qualifyingAmountMinorUnits: amountMinorUnits },
  ))!
  await markIneligiblePurchaseReversalCompleted(claim.cancellation!)
  await Promise.all(
    claim.reversals.map((reversal, index) =>
      completeIneligiblePurchaseReversal(reversal, {
        amountMinorUnits: index === 0 ? initialRefundedMinorUnits : 0,
        providerRefundId:
          index === 0 && initialRefundedMinorUnits > 0
            ? `re_initial_won_dispute_${randomUUID()}`
            : null,
      }),
    ),
  )
  return {
    amountMinorUnits,
    chargeIds,
    disputeId: `dp_won_dispute_${randomUUID()}`,
    initialRefundedMinorUnits,
    invoiceId,
    paymentIntentIds,
    subscriptionId,
    targetAmountsMinorUnits,
  }
}

export function createRecoveryOperations(
  fixture: Awaited<ReturnType<typeof createWonDisputeRecoveryFixture>>,
  refundedMinorUnits = fixture.initialRefundedMinorUnits,
  targetIndex = 0,
): WonDisputeRecoveryOperations {
  const targetAmountMinorUnits = fixture.targetAmountsMinorUnits[targetIndex]!
  const refunds =
    refundedMinorUnits === 0
      ? []
      : [
          {
            amount: refundedMinorUnits,
            currency: 'usd',
            id: `re_existing_${randomUUID()}`,
            status: 'succeeded',
          },
        ]
  const createRefund = vi
    .fn<IneligibleStripePurchaseOperations['createRefund']>()
    .mockResolvedValue({
      amount: targetAmountMinorUnits - refundedMinorUnits,
      currency: 'usd',
      id: `re_won_dispute_${randomUUID()}`,
      status: 'succeeded',
    } as never)
  return {
    cancelSubscriptionImmediately:
      vi.fn<IneligibleStripePurchaseOperations['cancelSubscriptionImmediately']>(),
    createRefund,
    getWonStripeDisputeInvoice: vi
      .fn<WonDisputeRecoveryOperations['getWonStripeDisputeInvoice']>()
      .mockResolvedValue({
        chargeId: fixture.chargeIds[targetIndex]!,
        invoiceIds: [fixture.invoiceId],
        paymentIntentId: fixture.paymentIntentIds[targetIndex]!,
      }),
    getDisputeSettlementForPayment: vi
      .fn<NonNullable<IneligibleStripePurchaseOperations['getDisputeSettlementForPayment']>>()
      .mockResolvedValue({ lostDisputeAmountMinorUnits: 0, refundDeferred: false }),
    listRefundsForPaymentPage: vi
      .fn<IneligibleStripePurchaseOperations['listRefundsForPaymentPage']>()
      .mockResolvedValue({ hasMore: false, nextCursor: undefined, refunds } as never),
    listSubscriptionInvoices: vi
      .fn<IneligibleStripePurchaseOperations['listSubscriptionInvoices']>()
      .mockResolvedValue([
        {
          created: 1_893_369_600,
          currency: 'usd',
          id: fixture.invoiceId,
          payments: {
            data: fixture.targetAmountsMinorUnits.map((amount, index) => ({
              amount_paid: amount,
              payment: {
                payment_intent: fixture.paymentIntentIds[index]!,
                type: 'payment_intent',
              },
            })),
          },
          status: 'paid',
        },
      ] as never),
  }
}
