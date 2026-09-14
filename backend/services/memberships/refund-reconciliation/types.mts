import type { Money } from '@ts-shared/money'
import type { MembershipRefundReason } from '../types.mts'

export type AdministratorRefundRequest = {
  amount: Money
  cancelRequested: boolean
  idempotencyKey: string
  issuedById: string
  membershipId: string
  note: string | null
  /** Provider invoice periods are unavailable for an administrator-selected charge target. */
  periodEndsAt: Date | null
  periodStartedAt: Date | null
  providerPaymentReference: string
  providerSubscriptionReference: string | null
  reason: MembershipRefundReason
  requestFingerprint: string
}

export type RefundReconciliationLease = {
  amount: Money
  attemptOrdinal: number
  id: string
  leaseToken: string
  provider: string
  providerApplicationId: string
  providerEnvironment: string
  providerRefundId: string | null
}

export type RefundReconciliationAttempt = {
  amount: Money
  attemptOrdinal: number
  id: string
  membershipOperationId: string
  providerIdempotencyKey: string
  providerRefundId: string | null
}

export type RefundReconciliationDispatch = Pick<RefundReconciliationLease, 'id' | 'leaseToken'>

export type RefundReconciliationResult =
  | {
      outcome: 'completed'
      refundId: string
      cancellationStatus: 'not_requested' | 'completed' | 'pending'
    }
  | { outcome: 'reconciling' }
