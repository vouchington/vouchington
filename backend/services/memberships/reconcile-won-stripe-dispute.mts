import { getMembershipWorkLimit } from './work-limits.mts'
import * as stripeDisputes from '@modules/stripe/disputes'
import * as stripeInvoices from '@modules/stripe/invoices'
import * as stripeRefunds from '@modules/stripe/refunds'
import * as stripeSubscriptions from '@modules/stripe/subscriptions'
import { DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT } from './create-types.mts'
import { IneligiblePurchaseReversalInProgressError } from './ineligible-stripe-purchase-reversal-execution.mts'
import { claimWonStripeDisputeRecovery } from './ineligible-stripe-purchase-reversal/won-dispute-recovery-ledger.mts'
import { executeIneligibleStripePurchaseReversal } from './ineligible-stripe-purchase-reversal/execute.mts'
import { getIneligiblePurchaseReversalCase } from './ineligible-stripe-purchase-reversal/case-read.mts'
import {
  createStripeRefundScanCallBudget,
  getDurableStripeRefundHistory,
  withStripeRefundScanCycle,
} from './ineligible-stripe-purchase-reversal/refund-scan.mts'
import {
  getInvoicesInReversalWindow,
  getRefundableReversalTargets,
} from './ineligible-stripe-purchase-reversal-targets.mts'
import type { IneligibleStripePurchaseOperations } from './reverse-ineligible-stripe-purchase-types.mts'

type WonStripeDisputeOperations = IneligibleStripePurchaseOperations & {
  getWonStripeDisputeInvoice: (
    id: string,
  ) => ReturnType<typeof stripeDisputes.getWonStripeDisputeInvoice>
}

export async function reconcileWonStripeDispute(options: {
  disputeId: string
  operations?: WonStripeDisputeOperations
  providerApplicationId?: string
  providerEnvironment: 'test' | 'production'
}): Promise<boolean> {
  const operations = options.operations ?? getStripeOperations()
  const dispute = await operations.getWonStripeDisputeInvoice(options.disputeId)
  if (!dispute) return false
  const providerApplicationId =
    options.providerApplicationId ?? DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT.applicationId
  const reversalCases = (
    await Promise.all(
      dispute.invoiceIds.map(originatingInvoiceId =>
        getIneligiblePurchaseReversalCase({
          originatingInvoiceId,
          providerApplicationId,
          providerEnvironment: options.providerEnvironment,
        }),
      ),
    )
  ).filter(reversalCase => reversalCase !== null)
  if (reversalCases.length === 0) return false
  if (reversalCases.length > 1)
    throw new Error(`Stripe dispute ${options.disputeId} matched more than one reversal case`)
  const reversalCase = reversalCases[0]!
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
  const target = targets.find(
    candidate =>
      candidate.chargeId === dispute.chargeId ||
      candidate.paymentIntentId === dispute.paymentIntentId,
  )
  if (!target) return false
  let recovery
  try {
    recovery = await claimWonStripeDisputeRecovery(reversalCase, options.disputeId, target)
  } catch (err) {
    if (err instanceof IneligiblePurchaseReversalInProgressError) return true
    throw err
  }
  if (!recovery) return false
  await executeIneligibleStripePurchaseReversal(
    { cancellation: null, reversals: [recovery] },
    reversalCase.subscriptionId,
    operations,
  )
  return true
}

function getStripeOperations(): WonStripeDisputeOperations {
  const invoiceLimits = {
    invoicePages: getMembershipWorkLimit('stripe_subscription_invoice_max_pages'),
    paymentPages: getMembershipWorkLimit('stripe_invoice_payment_max_pages'),
    linePages: getMembershipWorkLimit('stripe_invoice_line_max_pages'),
  }
  const disputePages = getMembershipWorkLimit('stripe_dispute_max_pages')
  return {
    cancelSubscriptionImmediately: stripeSubscriptions.cancelStripeSubscriptionImmediately,
    createRefund: stripeRefunds.createStripeRefund,
    getDisputeSettlementForPayment: options =>
      stripeDisputes.getStripeDisputeSettlementForPayment(options, disputePages),
    getWonStripeDisputeInvoice: id =>
      stripeDisputes.getWonStripeDisputeInvoice(id, invoiceLimits.paymentPages),
    retrieveRefund: stripeRefunds.getStripeRefund,
    listSubscriptionInvoices: id =>
      stripeInvoices.listAllStripeSubscriptionInvoices(id, invoiceLimits),
    listRefundsForPaymentPage: stripeRefunds.listStripeRefundsForPaymentPage,
  }
}
