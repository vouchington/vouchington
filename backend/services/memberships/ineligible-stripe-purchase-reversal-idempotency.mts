import { createHash } from 'node:crypto'
import type { ReversalTarget } from './ineligible-stripe-purchase-reversal-types.mts'

export function createIneligiblePurchaseReversalIdempotencyKey(
  environment: 'test' | 'production',
  applicationId: string,
  subscriptionId: string,
  target: ReversalTarget,
): string {
  const targetKind = target.chargeId ? 'charge' : 'payment_intent'
  const targetId = target.chargeId ?? target.paymentIntentId
  if (!targetId || (target.chargeId && target.paymentIntentId))
    throw new Error('Stripe reversal target must have exactly one payment identifier')
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        currency: target.currency,
        environment,
        applicationId,
        invoiceId: target.invoiceId,
        subscriptionId,
        targetKind,
        targetId,
      }),
    )
    .digest('hex')
  return `voucha-membership-ineligible-reversal:${digest}`
}

export function createIneligiblePurchaseCancellationIdempotencyKey(
  environment: 'test' | 'production',
  applicationId: string,
  subscriptionId: string,
): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({ applicationId, environment, subscriptionId }))
    .digest('hex')
  return `voucha-membership-ineligible-cancellation:${digest}`
}

export function createIneligiblePurchaseReversalRetryIdempotencyKey(
  providerRefundId: string,
): string {
  const digest = createHash('sha256').update(providerRefundId).digest('hex')
  return `voucha-membership-ineligible-reversal-retry:${digest}`
}

export const WON_DISPUTE_RECOVERY_IDEMPOTENCY_PREFIX =
  'voucha-membership-ineligible-reversal-won-dispute:'

export function createWonDisputeRecoveryIdempotencyPrefix(originalOperationId: string): string {
  return `${WON_DISPUTE_RECOVERY_IDEMPOTENCY_PREFIX}${originalOperationId}:`
}

export function createWonDisputeRecoveryIdempotencyKey(
  originalOperationId: string,
  disputeId: string,
): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({ disputeId, originalOperationId }))
    .digest('hex')
  return `${createWonDisputeRecoveryIdempotencyPrefix(originalOperationId)}${digest}`
}
