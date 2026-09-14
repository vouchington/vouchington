export type StripeCheckoutSessionResult = { id: string; url: string | null }
export type StripeBillingPortalSessionResult = { url: string }
export type StripeRefundResult = {
  id: string
  chargeId: string | null
  paymentIntentId: string | null
  amount: number
  currency: string
}
export type StripeInvoicePaymentSummary = {
  amountPaid: number
  payment: { type: string; chargeId: string | null; paymentIntentId: string | null }
}
export type StripeInvoiceSummary = {
  id: string
  status: string | null
  amountPaid: number
  currency: string
  created: number
  description: string | null
  payments: StripeInvoicePaymentSummary[]
}
export type CreateMembershipCheckoutSessionPayload = {
  userId: string
  email?: string
  priceId: string
  purchaseIntentId: string
  successUrl: string
  cancelUrl: string
  customerIdempotencyKey: string
  checkoutIdempotencyKey: string
}
export type CreateIdentityCheckoutSessionPayload = {
  userId: string
  email?: string
  priceAmountMinorUnits: number
  currency: string
  productName: string
  successUrl: string
  cancelUrl: string
  metadata: Record<string, string>
  customerIdempotencyKey: string
  checkoutIdempotencyKey: string
}
export type CreateBillingPortalSessionPayload = {
  customerId: string
  returnUrl: string
  idempotencyKey: string
}
export type CancelSubscriptionAtPeriodEndPayload = {
  subscriptionId: string
  idempotencyKey: string
}
export type RetrieveIdentityVerificationSessionUrlPayload = { sessionId: string }
export type ListSubscriptionInvoicesPayload = { subscriptionId: string; limit: number }
export type CreateRefundPayload = {
  chargeId?: string
  paymentIntentId?: string
  amountMinorUnits?: number
  idempotencyKey: string
  metadata?: Record<string, string>
}
export type CancelSubscriptionImmediatelyPayload = { subscriptionId: string }
export type SanitizeCustomerPayload = { customerId: string; idempotencyKey: string }
