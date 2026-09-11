import * as stripeDisputes from '@modules/stripe/disputes'
import * as stripeInvoices from '@modules/stripe/invoices'
import * as stripeRefunds from '@modules/stripe/refunds'
import * as stripeSubscriptions from '@modules/stripe/subscriptions'
import { claimPersistedIneligiblePurchaseReversalCase } from './ineligible-stripe-purchase-reversal/claim-ledger.mts'
import {
  getIneligiblePurchaseReversalCase,
  type IneligiblePurchaseReversalCaseLookup,
} from './ineligible-stripe-purchase-reversal/case-read.mts'
import { executeIneligibleStripePurchaseReversal } from './ineligible-stripe-purchase-reversal/execute.mts'
import {
  createStripeRefundScanCallBudget,
  getDurableStripeRefundHistory,
  withStripeRefundScanCycle,
} from './ineligible-stripe-purchase-reversal/refund-scan.mts'
import {
  getInvoicesInReversalWindow,
  getRefundableReversalTargets,
} from './ineligible-stripe-purchase-reversal-targets.mts'
import type { IneligibleStripePurchaseOperations } from './reverse-ineligible-stripe-purchase.mts'

export async function reconcileRecordedIneligibleStripePurchaseReversal(
  options: IneligiblePurchaseReversalCaseLookup & {
    operations?: IneligibleStripePurchaseOperations
  },
): Promise<boolean> {
  const reversalCase = await getIneligiblePurchaseReversalCase(options)
  if (!reversalCase) return false
  const operations = options.operations ?? getStripeOperations()
  const invoices = getInvoicesInReversalWindow(
    await operations.listSubscriptionInvoices(reversalCase.subscriptionId),
    {
      billingStartedAt: undefined,
      billingEndsAt: undefined,
      bindingBoundAt: null,
      bindingReleasedAt: null,
      originatingInvoiceId: reversalCase.originatingInvoiceId,
    },
  )
  if (invoices.length !== 1)
    throw new Error(
      `Stripe reversal invoice ${reversalCase.originatingInvoiceId} was not found exactly once`,
    )
  const targets = await withStripeRefundScanCycle(reversalCase.id, async scanCycle => {
    const callBudget = createStripeRefundScanCallBudget()
    return getRefundableReversalTargets(
      invoices,
      target =>
        getDurableStripeRefundHistory({
          callBudget,
          listRefundsForPaymentPage: operations.listRefundsForPaymentPage,
          reversalCaseId: reversalCase.id,
          scanCycle,
          target,
        }),
      operations.getDisputeSettlementForPayment,
    )
  })
  const claim = await claimPersistedIneligiblePurchaseReversalCase(
    { ...options, subscriptionId: reversalCase.subscriptionId },
    targets,
  )
  if (!claim) return false
  await executeIneligibleStripePurchaseReversal(claim, reversalCase.subscriptionId, operations)
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
