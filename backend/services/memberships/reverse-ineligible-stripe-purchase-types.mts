import * as stripeInvoices from '@modules/stripe/invoices'
import * as stripeDisputes from '@modules/stripe/disputes'
import * as stripeRefunds from '@modules/stripe/refunds'
import * as stripeSubscriptions from '@modules/stripe/subscriptions'

export type IneligibleStripePurchaseOperations = {
  cancelSubscriptionImmediately: typeof stripeSubscriptions.cancelStripeSubscriptionImmediately
  createRefund: typeof stripeRefunds.createStripeRefund
  getDisputeSettlementForPayment?: typeof stripeDisputes.getStripeDisputeSettlementForPayment
  retrieveRefund?: typeof stripeRefunds.getStripeRefund
  listSubscriptionInvoices: typeof stripeInvoices.listAllStripeSubscriptionInvoices
  listRefundsForPaymentPage: typeof stripeRefunds.listStripeRefundsForPaymentPage
}
