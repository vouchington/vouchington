import { createIneligiblePurchaseReversalIdempotencyKey } from '../ineligible-stripe-purchase-reversal-idempotency.mts'
import type { ReversalTarget } from '../ineligible-stripe-purchase-reversal-types.mts'
import type { IneligiblePurchaseReversalCase } from './case-ledger.mts'

export function allocateReversalCaseTargets(
  reversalCase: Pick<
    IneligiblePurchaseReversalCase,
    | 'currency'
    | 'providerApplicationId'
    | 'providerEnvironment'
    | 'refundCapMinorUnits'
    | 'subscriptionId'
  >,
  targets: readonly ReversalTarget[],
  persistedAllocations: ReadonlyMap<string, number>,
): ReversalTarget[] {
  const targetKeys = new Set(
    targets.map(target =>
      createIneligiblePurchaseReversalIdempotencyKey(
        reversalCase.providerEnvironment,
        reversalCase.providerApplicationId,
        reversalCase.subscriptionId,
        target,
      ),
    ),
  )
  for (const idempotencyKey of persistedAllocations.keys()) {
    if (!targetKeys.has(idempotencyKey))
      throw new Error(`Could not reconstruct Stripe reversal target for ${idempotencyKey}`)
  }
  let remainingCap = reversalCase.refundCapMinorUnits
  for (const allocation of persistedAllocations.values()) remainingCap -= allocation
  if (remainingCap < 0)
    throw new Error('Persisted reversal allocations exceed the immutable case cap')
  return targets.flatMap(target => {
    if (target.currency !== reversalCase.currency)
      throw new Error('Stripe reversal target currency does not match its immutable case')
    const idempotencyKey = createIneligiblePurchaseReversalIdempotencyKey(
      reversalCase.providerEnvironment,
      reversalCase.providerApplicationId,
      reversalCase.subscriptionId,
      target,
    )
    const qualifyingAmountMinorUnits =
      persistedAllocations.get(idempotencyKey) ??
      Math.min(target.qualifyingAmountMinorUnits, remainingCap)
    if (qualifyingAmountMinorUnits > target.qualifyingAmountMinorUnits)
      throw new Error('Stripe reversal target shrank below its persisted allocation')
    if (!persistedAllocations.has(idempotencyKey)) remainingCap -= qualifyingAmountMinorUnits
    if (qualifyingAmountMinorUnits === 0) return []
    const externallySatisfiedMinorUnits = Math.min(
      target.externallySatisfiedMinorUnits ?? 0,
      qualifyingAmountMinorUnits,
    )
    return [
      {
        ...target,
        amountMinorUnits: Math.min(
          target.amountMinorUnits,
          qualifyingAmountMinorUnits - externallySatisfiedMinorUnits,
        ),
        externallySatisfiedMinorUnits,
        qualifyingAmountMinorUnits,
      },
    ]
  })
}
