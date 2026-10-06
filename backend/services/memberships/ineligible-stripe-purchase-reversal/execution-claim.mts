import type { QueryExecutor } from '@data-stores/psql'
import { IneligiblePurchaseReversalInProgressError } from '../ineligible-stripe-purchase-reversal-execution.mts'
import { claimMembershipOperationExecutionWork } from '../operation-execution-work.mts'

export async function claimIneligiblePurchaseReversalExecution(
  id: string,
  query: QueryExecutor,
): Promise<string> {
  const leaseToken = await claimMembershipOperationExecutionWork(id, query)
  if (!leaseToken) throw new IneligiblePurchaseReversalInProgressError(id)
  return leaseToken
}
