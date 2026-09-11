import { allocateProportionalAmount } from '@vouchington/utils/money'
import type { ReversalTarget } from '../ineligible-stripe-purchase-reversal-types.mts'

export function getFamilyCollisionReversalTargets(
  targets: readonly ReversalTarget[],
  window: {
    collisionAt: Date
    periodEndsAt: Date
    periodStartedAt: Date
  },
): ReversalTarget[] {
  const targetsByInvoice = new Map<string, ReversalTarget[]>()
  for (const target of targets) {
    const invoiceTargets = targetsByInvoice.get(target.invoiceId ?? 'single-invoice')
    if (invoiceTargets) invoiceTargets.push(target)
    else targetsByInvoice.set(target.invoiceId ?? 'single-invoice', [target])
  }
  return [...targetsByInvoice.values()].flatMap(invoiceTargets =>
    getInvoiceFamilyCollisionReversalTargets(invoiceTargets, window),
  )
}

function getInvoiceFamilyCollisionReversalTargets(
  targets: readonly ReversalTarget[],
  window: { collisionAt: Date; periodEndsAt: Date; periodStartedAt: Date },
): ReversalTarget[] {
  let remainingProratedQualifyingMinorUnits = getFamilyCollisionRefundAmount(
    targets.reduce((total, target) => total + target.qualifyingAmountMinorUnits, 0),
    window,
  )
  return targets.map(target => {
    const qualifyingAmountMinorUnits = Math.min(
      target.qualifyingAmountMinorUnits,
      remainingProratedQualifyingMinorUnits,
    )
    remainingProratedQualifyingMinorUnits -= qualifyingAmountMinorUnits
    const externallyRefunded = Math.min(
      target.externallySatisfiedMinorUnits ?? 0,
      qualifyingAmountMinorUnits,
    )
    const amountMinorUnits = qualifyingAmountMinorUnits - externallyRefunded
    return {
      ...target,
      amountMinorUnits,
      ...(target.externallySatisfiedMinorUnits === undefined && externallyRefunded === 0
        ? {}
        : { externallySatisfiedMinorUnits: externallyRefunded }),
      providerObservedAmountMinorUnits:
        target.providerObservedAmountMinorUnits ?? target.amountMinorUnits,
      qualifyingAmountMinorUnits,
    }
  })
}

export function getCollisionPeriod(
  sourceKind: 'admin_grant' | 'direct' | 'family',
  options: { effectiveAt: Date | undefined; expiresAt: Date | undefined },
  collisionAt: Date,
): { collisionAt: Date; periodEndsAt: Date; periodStartedAt: Date } {
  if (
    sourceKind === 'family' &&
    (!options.effectiveAt ||
      !options.expiresAt ||
      !Number.isFinite(options.effectiveAt.getTime()) ||
      !Number.isFinite(options.expiresAt.getTime()))
  )
    throw new Error('Stripe family collision requires effective and expiry timestamps')
  const periodStartedAt = options.effectiveAt ?? collisionAt
  return { collisionAt, periodEndsAt: options.expiresAt ?? periodStartedAt, periodStartedAt }
}

export function getFamilyCollisionRefundAmount(
  remainingRefundableMinorUnits: number,
  window: {
    collisionAt: Date
    periodEndsAt: Date
    periodStartedAt: Date
  },
): number {
  const periodMilliseconds = window.periodEndsAt.getTime() - window.periodStartedAt.getTime()
  if (!Number.isFinite(periodMilliseconds) || periodMilliseconds <= 0)
    throw new Error('Stripe family collision requires a positive service period')
  const unusedMilliseconds = Math.min(
    periodMilliseconds,
    Math.max(0, window.periodEndsAt.getTime() - window.collisionAt.getTime()),
  )
  return allocateProportionalAmount(
    remainingRefundableMinorUnits,
    unusedMilliseconds,
    periodMilliseconds,
    'up',
  )
}
