import { createHash } from 'node:crypto'
import type { MembershipVerificationReasonCode } from '../verification-contract.mts'
import type {
  GooglePlayMembershipExpectedProduct,
  GooglePlaySubscriptionV2,
  GooglePlaySubscriptionVerificationResult,
} from './types.mts'

const ENTITLING_OR_TERMINAL_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
  'SUBSCRIPTION_STATE_CANCELED',
  'SUBSCRIPTION_STATE_EXPIRED',
  'SUBSCRIPTION_STATE_ON_HOLD',
  'SUBSCRIPTION_STATE_PAUSED',
])

/** Normalizes only an authoritative subscriptionsv2 response fetched by a worker. */
export function verifyGooglePlaySubscription(options: {
  subscription: GooglePlaySubscriptionV2
  purchaseToken: string
  applicationId: string
  environment: 'test' | 'production'
  expectedProduct: GooglePlayMembershipExpectedProduct
  now?: Date
}): GooglePlaySubscriptionVerificationResult {
  const subscription = options.subscription
  const state = subscription.subscriptionState
  if (
    !state ||
    (state !== 'SUBSCRIPTION_STATE_PENDING' && !ENTITLING_OR_TERMINAL_STATES.has(state))
  )
    return rejected('invalid_evidence')
  if (Boolean(subscription.testPurchase) !== (options.environment === 'test'))
    return rejected('wrong_environment')
  const lineItem = subscription.lineItems?.find(item =>
    matchesExpectedGooglePlayProduct(item, options.expectedProduct),
  )
  const deferredReplacement = subscription.lineItems?.find(item =>
    matchesDeferredGooglePlayReplacement(item, options.expectedProduct),
  )
  if (!lineItem && !deferredReplacement) return rejected('wrong_product')
  const accountId =
    subscription.externalAccountIdentifiers?.obfuscatedExternalAccountId ??
    subscription.outOfAppPurchaseContext?.expiredExternalAccountIdentifiers
      ?.obfuscatedExternalAccountId
  if (accountId !== options.expectedProduct.expectedObfuscatedAccountId)
    return rejected('wrong_account')
  if (state === 'SUBSCRIPTION_STATE_PENDING')
    return { accepted: false, reasonCode: 'purchase_pending', bindablePending: true }
  const expiry = lineItem ? parseGoogleTimestamp(lineItem.expiryTime) : null
  if (deferredReplacement && !expiry)
    return { accepted: false, reasonCode: 'purchase_pending', bindablePending: true }
  if (!lineItem || !expiry) return rejected('invalid_evidence')
  const orderId =
    requiredText(subscription.latestOrderId) ??
    `token:${createHash('sha256').update(options.purchaseToken).digest('hex')}`
  const startTime = parseGoogleTimestamp(subscription.startTime)
  if (subscription.startTime !== undefined && (!startTime || startTime > expiry))
    return rejected('invalid_evidence')
  const now = options.now ?? new Date()
  const lifecycle = toLifecycle(state, expiry, now)
  const terminalAt =
    lifecycle === 'active'
      ? null
      : lifecycle === 'paused'
        ? new Date(Math.min(expiry.getTime(), now.getTime()))
        : expiry
  return {
    accepted: true,
    acknowledgementPending:
      lifecycle === 'active' &&
      (state === 'SUBSCRIPTION_STATE_ACTIVE' ||
        state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' ||
        state === 'SUBSCRIPTION_STATE_CANCELED') &&
      subscription.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
    observation: {
      provider: 'google_play',
      environment: options.environment,
      applicationId: options.applicationId,
      membershipProductId: options.expectedProduct.membershipProductId,
      providerProductId: options.expectedProduct.providerProductId,
      // Linked tokens identify a replacement family. The current token stays the event/revision key.
      providerLineageId: requiredText(subscription.linkedPurchaseToken) ?? options.purchaseToken,
      providerEventId: options.purchaseToken,
      // State is part of the canonical revision: cancellation can retain the same expiry/order ID.
      providerRevision: `${orderId}:${state}:${lineItem.autoRenewingPlan?.autoRenewEnabled === true ? 'renewing' : 'nonrenewing'}`,
      sourceKind: 'direct',
      effectiveAt: startTime,
      expiresAt: expiry,
      terminalAt,
      lifecycle,
      autoRenews: lineItem.autoRenewingPlan?.autoRenewEnabled === true,
    },
  }
}

function toLifecycle(
  state: NonNullable<GooglePlaySubscriptionV2['subscriptionState']>,
  expiry: Date,
  now: Date,
): 'active' | 'expired' | 'revoked' | 'paused' {
  if (state === 'SUBSCRIPTION_STATE_ON_HOLD' || state === 'SUBSCRIPTION_STATE_PAUSED')
    return 'paused'
  if (state === 'SUBSCRIPTION_STATE_EXPIRED' || expiry <= now) return 'expired'
  if (state === 'SUBSCRIPTION_STATE_CANCELED') return 'active'
  return 'active'
}

function parseGoogleTimestamp(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function matchesExpectedGooglePlayProduct(
  item: NonNullable<GooglePlaySubscriptionV2['lineItems']>[number],
  expected: GooglePlayMembershipExpectedProduct,
): boolean {
  return (
    item.productId === expected.providerProductId &&
    requiredText(item.offerDetails?.basePlanId) === (expected.basePlanId ?? null) &&
    requiredText(item.offerDetails?.offerId) === (expected.offerId ?? null)
  )
}

export function matchesDeferredGooglePlayReplacement(
  item: NonNullable<GooglePlaySubscriptionV2['lineItems']>[number],
  expected: GooglePlayMembershipExpectedProduct,
): boolean {
  return item.deferredItemReplacement?.productId === expected.providerProductId
}

function requiredText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function rejected(
  reasonCode: MembershipVerificationReasonCode,
): GooglePlaySubscriptionVerificationResult {
  return { accepted: false, reasonCode }
}
