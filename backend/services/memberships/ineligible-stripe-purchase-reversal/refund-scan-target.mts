export type StripeRefundScanTarget = {
  chargeId: string | null
  currency: string
  invoiceId: string
  paymentIntentId: string | null
}
