import { scheduleRefundReconciliationRetry } from './ledger.mts'
import { RefundProviderOperationError } from './provider-operations.mts'
import type { RefundReconciliationPolicy } from './reconcile.mts'
import type { RefundReconciliationLease } from './types.mts'

export async function handleRefundProviderOutcome<Context>(
  policy: RefundReconciliationPolicy<Context>,
  lease: RefundReconciliationLease,
  message: string,
): Promise<void> {
  if (!policy.providerFailuresAreDurable) throw new RefundProviderOperationError(message)
  const multiplier = 2 ** Math.min(Math.max(lease.attemptOrdinal - 1, 0), 8)
  const delayMs = Math.min(5 * 60 * 1000 * multiplier, 24 * 60 * 60 * 1000)
  await scheduleRefundReconciliationRetry(lease, new Date(Date.now() + delayMs), message)
}
