import type { Membership, MembershipSku } from './types.mts'

export type IneligibleStripePurchase = {
  customerId: string
  effectiveAt: Date | undefined
  expiresAt: Date | undefined
  incomingPlan: Membership['plan']
  incomingStatus: Membership['status']
  originatingInvoiceId: string
  providerEnvironment: 'test' | 'production'
  providerApplicationId?: string
  sku: Pick<MembershipSku, 'id'>
  stripePriceId: string
  subscriptionId: string
  userId: string
}

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
  executionClaimToken: string | null
  hasReceipt: boolean
  id: string
  idempotencyKey: string
  providerRefundId: string | null
  target: ReversalTarget
}

export type ClaimedCancellation = {
  completed: boolean
  executionClaimToken: string | null
  id: string
  idempotencyKey: string
}

export type ClaimedIneligiblePurchaseReversals = {
  cancellation: ClaimedCancellation | null
  reversals: ClaimedReversal[]
}
