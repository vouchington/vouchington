import { beginTransaction } from '@data-stores/psql'
import { claimIneligiblePurchaseCancellationOperation } from '../ineligible-stripe-purchase-cancellation.mts'
import type {
  ClaimedIneligiblePurchaseReversals,
  ReversalTarget,
} from '../ineligible-stripe-purchase-reversal-types.mts'
import {
  getLockedIneligiblePurchaseReversalCase,
  getReversalCaseTargetAllocations,
} from './case-ledger.mts'
import { allocateReversalCaseTargets } from './case-allocation.mts'
import { claimIneligiblePurchaseReversalTargets } from './target-ledger.mts'
export async function claimPersistedIneligiblePurchaseReversalCase(
  options: {
    originatingInvoiceId: string
    providerApplicationId?: string
    providerEnvironment: 'test' | 'production'
    subscriptionId: string
  },
  reversalTargets: readonly ReversalTarget[],
): Promise<ClaimedIneligiblePurchaseReversals | null> {
  await using transaction = await beginTransaction()
  const reversalCase = await getLockedIneligiblePurchaseReversalCase(
    {
      ...options,
      providerApplicationId: options.providerApplicationId ?? 'voucha-web',
    },
    transaction,
  )
  if (!reversalCase) {
    await transaction.commit()
    return null
  }
  const targets = allocateReversalCaseTargets(
    reversalCase,
    reversalTargets,
    await getReversalCaseTargetAllocations(reversalCase.id, transaction),
  )
  const reversals = await claimIneligiblePurchaseReversalTargets(
    targets,
    {
      collisionAt: reversalCase.collisionAt,
      membershipLineageBindingId: reversalCase.membershipLineageBindingId,
      membershipProviderLineageId: reversalCase.membershipProviderLineageId,
      membershipSourceId: reversalCase.membershipSourceId,
      periodEndsAt: reversalCase.periodEndsAt,
      periodStartedAt: reversalCase.periodStartedAt,
      providerApplicationId: reversalCase.providerApplicationId,
      providerEnvironment: reversalCase.providerEnvironment,
      query: transaction,
      reversalCaseId: reversalCase.id,
      subscriptionId: reversalCase.subscriptionId,
    },
    [],
  )
  const cancellation = await claimIneligiblePurchaseCancellationOperation(
    reversalCase.membershipSourceId,
    reversalCase.membershipLineageBindingId,
    reversalCase.membershipProviderLineageId,
    reversalCase.providerEnvironment,
    reversalCase.providerApplicationId,
    reversalCase.subscriptionId,
    transaction,
  )
  await transaction.commit()
  return { cancellation, reversals }
}
