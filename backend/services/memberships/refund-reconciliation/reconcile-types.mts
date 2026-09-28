import type { RefundReconciliationLease } from './types.mts'

export type RefundReconciliationPolicy<Context> = {
  complete: (
    lease: RefundReconciliationLease,
    context: Context,
    refund: SucceededRefund,
  ) => Promise<'completed' | 'pending'>
  createLookup: (context: Context) => { chargeId?: string; paymentIntentId?: string }
  getContext: (operationId: string) => Promise<Context | null>
  knownProviderRefundId?: (context: Context) => string | null
  lookup: (context: Context) => { chargeId: string | null; paymentIntentId: string | null }
  providerIdempotencyKey: (
    lease: RefundReconciliationLease,
    priorTerminalRefund: { id: string } | null,
  ) => string
  providerFailuresAreDurable?: boolean
}

type SucceededRefund = {
  amount: number
  charge: string | { id: string } | null
  currency: string
  id: string
  payment_intent: string | { id: string } | null
}
