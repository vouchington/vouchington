import { allocateProportionalAmount } from '@vouchington/utils/money'

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
