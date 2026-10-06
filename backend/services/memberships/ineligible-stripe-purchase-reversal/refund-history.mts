export type StripeRefund = {
  amount: number
  currency: string
  id: string
  status: string | null
}

export type StripeRefundHistory = {
  alreadyRefundedMinorUnits: number
  refundDeferred: boolean
}
