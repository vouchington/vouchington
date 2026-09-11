import createHttpError from 'http-errors'
import { getLatestMembershipByUserId } from './get.mts'
import {
  getMembershipRefundByStripeIdempotencyKey,
  recordAdminMembershipRefund,
} from './refunds.mts'
import { mapMembershipRefundRequestConflict } from './refund-errors.mts'
import { resumeMembershipRefundCancellation } from './refund-cancellation.mts'
import { replayMembershipRefundReceipt } from './refund-receipt-replay.mts'
import {
  claimMembershipRefundIntent,
  getMembershipRefundIntentByStripeIdempotencyKey,
} from './refund-intents.mts'
import {
  createRefundRequestFingerprint,
  createStripeRefundIdempotencyKey,
  type MembershipRefundRequestIntent,
} from './refund-idempotency.mts'
import {
  listRefundableCharges,
  type MembershipStripeOperations,
} from './refund-stripe-operations.mts'
import { isCurrencyCode } from '@ts-shared/money'
import type { Membership, MembershipRefund } from './types.mts'
import {
  getValidatedRefundableCharge,
  requireMembershipSourceId,
  resolveMembershipRefundIntent,
} from './refund-target.mts'
import { omitMembershipRefundLedgerSource } from './refund-row-mapping.mts'

export { listRefundableCharges, type MembershipStripeOperations }

export async function refundMembership(
  currentUserId: string,
  options: MembershipRefundRequestIntent,
  stripeOperations: MembershipStripeOperations,
): Promise<MembershipRefund> {
  const stripeIdempotencyKey = createStripeRefundIdempotencyKey(
    currentUserId,
    options.idempotencyToken,
  )
  const existingRefund = await getMembershipRefundByStripeIdempotencyKey(stripeIdempotencyKey)
  if (existingRefund) {
    const replayedRefund = await replayMembershipRefundReceipt({
      refund: existingRefund,
      currentUserId,
      request: options,
      stripeIdempotencyKey,
      membershipSourceId: existingRefund.membership_source_id,
      cancelSubscriptionImmediately: stripeOperations.cancelSubscriptionImmediately,
    })
    return omitMembershipRefundLedgerSource({
      ...replayedRefund,
      membership_source_id: existingRefund.membership_source_id,
    })
  }
  let existingIntent = await getMembershipRefundIntentByStripeIdempotencyKey(stripeIdempotencyKey)
  let membership: Pick<Membership, 'id'> | null
  let membershipSourceId: string
  let requestFingerprint: string
  if (existingIntent) {
    const resolvedIntent = await resolveMembershipRefundIntent(
      currentUserId,
      options,
      existingIntent,
    )
    membership = resolvedIntent.membership
    membershipSourceId = resolvedIntent.membershipSourceId
    requestFingerprint = resolvedIntent.requestFingerprint
  } else {
    membership = await getLatestMembershipByUserId(options.targetUserId)
    if (!membership) throw createHttpError(404, 'Membership not found')
    membershipSourceId = await requireMembershipSourceId(membership.id)
    requestFingerprint = createRefundRequestFingerprint(membership.id, options)
  }
  if (!membership) throw createHttpError(404, 'Membership not found')
  let refundTarget = await getValidatedRefundableCharge(
    membershipSourceId,
    options,
    stripeOperations,
  )
  let match = refundTarget.match
  const remainingMinorUnits = match.amount.amount - match.amount_refunded.amount
  const freshRequestIsInvalid =
    !existingIntent &&
    (remainingMinorUnits <= 0 ||
      (options.amount !== undefined && options.amount.amount > remainingMinorUnits))
  if (freshRequestIsInvalid) {
    const concurrentRefund = await getMembershipRefundByStripeIdempotencyKey(stripeIdempotencyKey)
    if (concurrentRefund) {
      return replayMembershipRefundReceipt({
        refund: concurrentRefund,
        currentUserId,
        request: options,
        stripeIdempotencyKey,
        membershipSourceId: concurrentRefund.membership_source_id,
        cancelSubscriptionImmediately: stripeOperations.cancelSubscriptionImmediately,
      })
    }
    existingIntent = await getMembershipRefundIntentByStripeIdempotencyKey(stripeIdempotencyKey)
    if (existingIntent) {
      const resolvedIntent = await resolveMembershipRefundIntent(
        currentUserId,
        options,
        existingIntent,
      )
      membership = resolvedIntent.membership
      membershipSourceId = resolvedIntent.membershipSourceId
      requestFingerprint = resolvedIntent.requestFingerprint
      refundTarget = await getValidatedRefundableCharge(
        membershipSourceId,
        options,
        stripeOperations,
      )
      match = refundTarget.match
    } else if (remainingMinorUnits <= 0) {
      throw createHttpError(400, 'Charge has already been fully refunded')
    } else {
      throw createHttpError(
        400,
        `Refund amount exceeds remaining refundable amount of ${remainingMinorUnits} minor units`,
      )
    }
  }
  if (!existingIntent) {
    await mapMembershipRefundRequestConflict(() =>
      claimMembershipRefundIntent({
        membershipId: membership.id,
        membershipSourceId,
        issuedById: currentUserId,
        stripeIdempotencyKey,
        requestFingerprint,
      }),
    )
  }
  const stripeRefund = await stripeOperations.createRefund({
    chargeId: match.charge_id ?? undefined,
    paymentIntentId: match.payment_intent_id ?? undefined,
    amountMinorUnits: options.amount?.amount,
    idempotencyKey: stripeIdempotencyKey,
  })
  const refundCurrency = stripeRefund.currency
  if (!isCurrencyCode(refundCurrency)) {
    throw createHttpError(502, 'Stripe refund returned an unsupported currency')
  }
  const stripeChargeId = stripeRefund.chargeId ?? match.charge_id ?? null
  if (!stripeChargeId) throw createHttpError(500, 'Stripe refund missing charge ID')
  const stripePaymentIntentId = stripeRefund.paymentIntentId ?? match.payment_intent_id ?? null
  const refundRow = await mapMembershipRefundRequestConflict(() =>
    recordAdminMembershipRefund({
      membershipId: membership.id,
      userId: options.targetUserId,
      stripeRefundId: stripeRefund.id,
      stripeChargeId,
      stripePaymentIntentId,
      stripeIdempotencyKey,
      adminRequestFingerprint: requestFingerprint,
      amount: {
        amount: stripeRefund.amount,
        currency: refundCurrency,
      },
      reason: options.reason,
      revokedAccess: false,
      issuedById: currentUserId,
      stripeEventId: null,
      note: options.note ?? null,
    }),
  )
  return resumeMembershipRefundCancellation(
    refundRow,
    membership,
    currentUserId,
    options,
    stripeIdempotencyKey,
    requestFingerprint,
    membershipSourceId,
    refundTarget.stripeSubscriptionId,
    stripeOperations.cancelSubscriptionImmediately,
  )
}
