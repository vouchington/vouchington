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

export function getObservedStripeRefunds(
  refunds: readonly StripeRefund[],
  currency: string,
): StripeRefundHistory {
  let alreadyRefundedMinorUnits = 0
  let refundDeferred = false
  for (const refund of refunds) {
    if (refund.status === 'failed' || refund.status === 'canceled') continue
    if (refund.currency !== currency)
      throw new Error(`Stripe refund currency ${refund.currency} did not match ${currency}`)
    if (refund.status !== 'succeeded') {
      refundDeferred = true
      continue
    }
    alreadyRefundedMinorUnits += refund.amount
  }
  return { alreadyRefundedMinorUnits, refundDeferred }
}
