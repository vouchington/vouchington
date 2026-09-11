import * as stripeInvoices from '@modules/stripe/invoices'
import * as stripeDisputes from '@modules/stripe/disputes'
import * as stripeRefunds from '@modules/stripe/refunds'
import * as stripeSubscriptions from '@modules/stripe/subscriptions'
import {
  claimIneligiblePurchaseReversalCaseForDiscovery,
  claimPersistedIneligiblePurchaseReversalCase,
} from './ineligible-stripe-purchase-reversal/claim-ledger.mts'
import { executeIneligibleStripePurchaseReversal } from './ineligible-stripe-purchase-reversal/execute.mts'
import { prepareIneligiblePurchaseReversal } from './ineligible-stripe-purchase-reversal/prepare.mts'
import {
  createStripeRefundScanCallBudget,
  getDurableStripeRefundHistory,
  withStripeRefundScanCycle,
} from './ineligible-stripe-purchase-reversal/refund-scan.mts'
import {
  getInvoicesInReversalWindow,
  getQualifyingInvoiceLineAmount,
  getRefundableReversalTargets,
} from './ineligible-stripe-purchase-reversal-targets.mts'
import type { IneligibleStripePurchase } from './ineligible-stripe-purchase-reversal-types.mts'

export type IneligibleStripePurchaseOperations = {
  cancelSubscriptionImmediately: typeof stripeSubscriptions.cancelStripeSubscriptionImmediately
  createRefund: typeof stripeRefunds.createStripeRefund
  getDisputeSettlementForPayment?: typeof stripeDisputes.getStripeDisputeSettlementForPayment
  retrieveRefund?: typeof stripeRefunds.getStripeRefund
  listSubscriptionInvoices: typeof stripeInvoices.listAllStripeSubscriptionInvoices
  listRefundsForPaymentPage: typeof stripeRefunds.listStripeRefundsForPaymentPage
}

/**
 * Reverses a paid Stripe subscription that lost the entitlement race. The operation row is
 * committed before Stripe is called, and its deterministic provider idempotency key makes every
 * event retry and concurrent delivery converge on the same cancellation and refund receipts.
 */
export async function reverseIneligibleStripePurchase(
  options: IneligibleStripePurchase & { operations?: IneligibleStripePurchaseOperations },
): Promise<boolean> {
  const operations = options.operations ?? getStripeOperations()
  const { disposition, bindingBoundAt, bindingReleasedAt, originatingInvoiceId } =
    await prepareIneligiblePurchaseReversal(options)
  if (disposition === 'converged') return true
  if (disposition === 'none') return false
  if (!originatingInvoiceId)
    throw new Error('Ineligible Stripe purchase is missing its originating invoice')
  const targetInvoiceId = originatingInvoiceId
  const invoices = getInvoicesInReversalWindow(
    await operations.listSubscriptionInvoices(options.subscriptionId),
    {
      billingStartedAt: options.effectiveAt,
      billingEndsAt: options.expiresAt,
      bindingBoundAt,
      bindingReleasedAt,
      originatingInvoiceId: targetInvoiceId,
    },
  )
  if (invoices.length !== 1)
    throw new Error(`Stripe reversal invoice ${targetInvoiceId} was not found exactly once`)
  const qualifyingAmountMinorUnits = getQualifyingInvoiceLineAmount(
    invoices[0]!,
    options.stripePriceId,
  )
  const claimedCase = await claimIneligiblePurchaseReversalCaseForDiscovery(options, {
    currency: invoices[0]!.currency,
    qualifyingAmountMinorUnits,
  })
  if (claimedCase.disposition !== 'ineligible') return claimedCase.disposition === 'converged'
  const reversalTargets = await withStripeRefundScanCycle(
    claimedCase.reversalCase.id,
    async scanCycle => {
      const callBudget = createStripeRefundScanCallBudget()
      return getRefundableReversalTargets(
        invoices,
        target =>
          getDurableStripeRefundHistory({
            callBudget,
            listRefundsForPaymentPage: operations.listRefundsForPaymentPage,
            reversalCaseId: claimedCase.reversalCase.id,
            scanCycle,
            target,
          }),
        operations.getDisputeSettlementForPayment,
      )
    },
  )
  const claimed = await claimPersistedIneligiblePurchaseReversalCase(
    {
      originatingInvoiceId: claimedCase.reversalCase.originatingInvoiceId,
      providerApplicationId: claimedCase.reversalCase.providerApplicationId,
      providerEnvironment: claimedCase.reversalCase.providerEnvironment,
      subscriptionId: claimedCase.reversalCase.subscriptionId,
    },
    reversalTargets,
  )
  if (claimed === null) return false
  await executeIneligibleStripePurchaseReversal(claimed, options.subscriptionId, operations)
  return true
}

function getStripeOperations(): IneligibleStripePurchaseOperations {
  return {
    cancelSubscriptionImmediately: stripeSubscriptions.cancelStripeSubscriptionImmediately,
    createRefund: stripeRefunds.createStripeRefund,
    getDisputeSettlementForPayment: stripeDisputes.getStripeDisputeSettlementForPayment,
    retrieveRefund: stripeRefunds.getStripeRefund,
    listSubscriptionInvoices: stripeInvoices.listAllStripeSubscriptionInvoices,
    listRefundsForPaymentPage: stripeRefunds.listStripeRefundsForPaymentPage,
  }
}
