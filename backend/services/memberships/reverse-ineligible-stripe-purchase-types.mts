export type IneligibleStripePurchaseOperations = {
  cancelSubscriptionImmediately: typeof stripeSubscriptions.cancelStripeSubscriptionImmediately
  createRefund: typeof stripeRefunds.createStripeRefund
  getDisputeSettlementForPayment?: typeof stripeDisputes.getStripeDisputeSettlementForPayment
  retrieveRefund?: typeof stripeRefunds.getStripeRefund
  listSubscriptionInvoices: typeof stripeInvoices.listAllStripeSubscriptionInvoices
  listRefundsForPaymentPage: typeof stripeRefunds.listStripeRefundsForPaymentPage
}
