import { isCurrencyCode, parsePostgresMoneyAmount } from '@ts-shared/money'
import type { RefundReconciliationAttempt, RefundReconciliationLease } from './types.mts'

export type ReconciliationLeaseRow = {
  amountMinorUnits: string
  attemptOrdinal: number
  currency: string
  id: string
  leaseToken: string
  provider: string
  providerApplicationId: string
  providerEnvironment: string
  providerRefundId: string | null
}

export type ReconciliationAttemptRow = {
  amountMinorUnits: string
  attemptOrdinal: number
  currency: string
  id: string
  membershipOperationId: string
  providerIdempotencyKey: string
  providerRefundId: string | null
}

export function mapLease(row: ReconciliationLeaseRow): RefundReconciliationLease {
  if (!isCurrencyCode(row.currency))
    throw new Error(`Invalid reconciliation currency ${row.currency}`)
  return {
    amount: { amount: parsePostgresMoneyAmount(row.amountMinorUnits), currency: row.currency },
    attemptOrdinal: row.attemptOrdinal,
    id: row.id,
    leaseToken: row.leaseToken,
    provider: row.provider,
    providerApplicationId: row.providerApplicationId,
    providerEnvironment: row.providerEnvironment,
    providerRefundId: row.providerRefundId,
  }
}

export function mapAttempt(row: ReconciliationAttemptRow): RefundReconciliationAttempt {
  if (!isCurrencyCode(row.currency))
    throw new Error(`Invalid reconciliation currency ${row.currency}`)
  return {
    amount: { amount: parsePostgresMoneyAmount(row.amountMinorUnits), currency: row.currency },
    attemptOrdinal: row.attemptOrdinal,
    id: row.id,
    membershipOperationId: row.membershipOperationId,
    providerIdempotencyKey: row.providerIdempotencyKey,
    providerRefundId: row.providerRefundId,
  }
}
