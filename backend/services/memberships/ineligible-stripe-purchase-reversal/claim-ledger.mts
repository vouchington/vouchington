import { beginTransaction, write } from '@data-stores/psql'
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
import { prepareReversalTargetCharges } from './target-charge-preflight.mts'
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
  const caseLookup = {
    ...options,
    providerApplicationId: options.providerApplicationId ?? 'voucha-web',
  }
  const preflight = reversalTargets.some(target => target.paymentIntentId)
    ? await prepareCaseTargetCharges(caseLookup, reversalTargets)
    : undefined
  if (preflight === null) return null

  await using transaction = await beginTransaction()
  const reversalCase = await getLockedIneligiblePurchaseReversalCase(caseLookup, transaction)
  if (!reversalCase || (preflight && reversalCase.id !== preflight.caseId)) {
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
      preparedCharges: preflight?.preparedCharges,
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

async function prepareCaseTargetCharges(
  caseLookup: Parameters<typeof getLockedIneligiblePurchaseReversalCase>[0],
  reversalTargets: readonly ReversalTarget[],
) {
  const reversalCase = await getLockedIneligiblePurchaseReversalCase(caseLookup, write)
  if (!reversalCase) return null
  const targets = allocateReversalCaseTargets(
    reversalCase,
    reversalTargets,
    await getReversalCaseTargetAllocations(reversalCase.id, write),
  )
  return {
    caseId: reversalCase.id,
    preparedCharges: await prepareReversalTargetCharges(reversalCase, targets),
  }
}
