export type ReversalTarget = {
  amountMinorUnits: number
  chargeId: string | null
  currency: string
  externallySatisfiedMinorUnits?: number
  invoiceId: string
  paymentIntentId: string | null
  providerObservedAmountMinorUnits?: number
  qualifyingAmountMinorUnits: number
  refundDeferred?: true
}

export type ClaimedReversal = {
  completed: boolean
  leaseToken: string | null
  hasReceipt: boolean
  id: string
  idempotencyKey: string
  providerRefundId: string | null
  target: ReversalTarget
}

export type ClaimedCancellation = {
  completed: boolean
  leaseToken: string | null
  id: string
  idempotencyKey: string
}

export type ClaimedIneligiblePurchaseReversals = {
  cancellation: ClaimedCancellation | null
  reversals: ClaimedReversal[]
}
