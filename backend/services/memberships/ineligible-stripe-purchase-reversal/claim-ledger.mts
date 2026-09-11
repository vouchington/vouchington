import { beginTransaction } from '@data-stores/psql'
import { createSource } from '../create-source.mts'
import { claimIneligiblePurchaseCancellationOperation } from '../ineligible-stripe-purchase-cancellation.mts'
import {
  getLockedCurrentMembership,
  getPurchaseDisposition,
} from '../ineligible-stripe-purchase-reversal-eligibility.mts'
import type {
  ClaimedIneligiblePurchaseReversals,
  IneligibleStripePurchase,
  ReversalTarget,
} from '../ineligible-stripe-purchase-reversal-types.mts'
import {
  claimIneligiblePurchaseReversalCase,
  getLockedIneligiblePurchaseReversalCase,
  getReversalCaseTargetAllocations,
  type IneligiblePurchaseReversalCase,
  type IneligiblePurchaseReversalCaseSnapshot,
} from './case-ledger.mts'
import { allocateReversalCaseTargets } from './case-allocation.mts'
import { getCollisionPeriod, getFamilyCollisionRefundAmount } from './family-proration.mts'
import { claimIneligiblePurchaseReversalTargets } from './target-ledger.mts'

export async function claimIneligiblePurchaseReversals(
  options: IneligibleStripePurchase,
  reversalTargets: readonly ReversalTarget[],
  caseSnapshot: IneligiblePurchaseReversalCaseSnapshot,
): Promise<ClaimedIneligiblePurchaseReversals | null> {
  const claimedCase = await claimIneligiblePurchaseReversalCaseForDiscovery(options, caseSnapshot)
  if (claimedCase.disposition !== 'ineligible')
    return claimedCase.disposition === 'none' ? null : { cancellation: null, reversals: [] }
  return claimPersistedIneligiblePurchaseReversalCase(
    {
      originatingInvoiceId: claimedCase.reversalCase.originatingInvoiceId,
      providerApplicationId: claimedCase.reversalCase.providerApplicationId,
      providerEnvironment: claimedCase.reversalCase.providerEnvironment,
      subscriptionId: claimedCase.reversalCase.subscriptionId,
    },
    reversalTargets,
  )
}

export async function claimIneligiblePurchaseReversalCaseForDiscovery(
  options: IneligibleStripePurchase,
  caseSnapshot: IneligiblePurchaseReversalCaseSnapshot,
): Promise<
  | { disposition: 'converged' | 'none'; reversalCase: null }
  | { disposition: 'ineligible'; reversalCase: IneligiblePurchaseReversalCase }
> {
  await using transaction = await beginTransaction()
  const membership = await getLockedCurrentMembership(options.userId, transaction)
  const disposition = getPurchaseDisposition(membership, options)
  if (disposition === 'none' || disposition === 'converged') {
    await transaction.commit()
    return { disposition, reversalCase: null }
  }
  if (!membership) throw new Error('Ineligible Stripe purchase is missing its current membership')
  const collisionAt = membership.sourceKind === 'family' ? membership.effectiveAt : new Date()
  const period = getCollisionPeriod(membership.sourceKind, options, collisionAt)
  const source = await createSource(
    {
      userId: options.userId,
      stripeSubscriptionId: options.subscriptionId,
      stripeOriginatingInvoiceId: options.originatingInvoiceId,
      stripeCustomerId: options.customerId,
      providerEnvironment: options.providerEnvironment,
      providerApplicationId: options.providerApplicationId,
    },
    options.sku.id,
    transaction,
  )
  if (!source.bindingId || !source.lineageId)
    throw new Error('Stripe reversal source is missing a provider lineage binding')
  const existingCase = await getLockedIneligiblePurchaseReversalCase(
    {
      originatingInvoiceId: options.originatingInvoiceId,
      providerApplicationId: options.providerApplicationId ?? 'voucha-web',
      providerEnvironment: options.providerEnvironment,
      subscriptionId: options.subscriptionId,
    },
    transaction,
  )
  const reversalCase =
    existingCase ??
    (await claimIneligiblePurchaseReversalCase(
      {
        collisionAt: period.collisionAt,
        currency: caseSnapshot.currency,
        membershipLineageBindingId: source.bindingId,
        membershipProviderLineageId: source.lineageId,
        membershipSourceId: source.id,
        periodEndsAt: period.periodEndsAt,
        periodStartedAt: period.periodStartedAt,
        qualifyingAmountMinorUnits: caseSnapshot.qualifyingAmountMinorUnits,
        refundCapMinorUnits:
          membership.sourceKind === 'family'
            ? getFamilyCollisionRefundAmount(caseSnapshot.qualifyingAmountMinorUnits, period)
            : caseSnapshot.qualifyingAmountMinorUnits,
        stripePriceId: options.stripePriceId,
        winningSourceKind: membership.sourceKind,
      },
      transaction,
    ))
  await transaction.commit()
  return { disposition: 'ineligible', reversalCase }
}
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
