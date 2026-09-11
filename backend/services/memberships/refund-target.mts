import createHttpError from 'http-errors'
import {
  getMembershipSourceIdByMembershipId,
  getStripeSubscriptionIdByMembershipSourceId,
} from './get.mts'
import {
  mapMembershipRefundRequestConflict,
  MembershipRefundRequestConflictError,
} from './refund-errors.mts'
import type { MembershipRefundIntent } from './refund-intents.mts'
import {
  createRefundRequestFingerprint,
  type MembershipRefundRequestIntent,
} from './refund-idempotency.mts'
import {
  listRefundableChargesForSubscription,
  matchesRefundRequest,
  type MembershipStripeOperations,
} from './refund-stripe-operations.mts'
import type { Membership, RefundableCharge } from './types.mts'

export async function getValidatedRefundableCharge(
  membershipSourceId: string,
  options: MembershipRefundRequestIntent,
  stripeOperations: MembershipStripeOperations,
): Promise<{ match: RefundableCharge; stripeSubscriptionId: string }> {
  const stripeSubscriptionId = await getStripeSubscriptionIdByMembershipSourceId(membershipSourceId)
  if (!stripeSubscriptionId) throw createHttpError(400, 'Not a Stripe subscription')
  const charges = await listRefundableChargesForSubscription(stripeSubscriptionId, stripeOperations)
  const match = charges.find(charge => matchesRefundRequest(charge, options))
  if (!match) throw createHttpError(400, 'No refundable charge found for membership')
  if (options.amount && options.amount.currency !== match.amount.currency) {
    throw createHttpError(400, 'Refund currency must match the refundable charge currency')
  }
  return { match, stripeSubscriptionId }
}

export async function resolveMembershipRefundIntent(
  currentUserId: string,
  options: MembershipRefundRequestIntent,
  existingIntent: MembershipRefundIntent,
): Promise<{
  membership: Pick<Membership, 'id'>
  membershipSourceId: string
  requestFingerprint: string
}> {
  const requestFingerprint = createRefundRequestFingerprint(existingIntent.membershipId, options)
  await mapMembershipRefundRequestConflict(() => {
    if (
      existingIntent.issuedById !== currentUserId ||
      existingIntent.requestFingerprint !== requestFingerprint
    ) {
      throw new MembershipRefundRequestConflictError()
    }
  })
  if (existingIntent.replayState === 'outcome_unknown') {
    throw createHttpError(
      409,
      'Refund outcome is unknown; reconciliation is required before retrying',
    )
  }
  const membership = { id: existingIntent.membershipId }
  return { membership, membershipSourceId: existingIntent.membershipSourceId, requestFingerprint }
}

export async function requireMembershipSourceId(membershipId: string): Promise<string> {
  const membershipSourceId = await getMembershipSourceIdByMembershipId(membershipId)
  if (membershipSourceId) return membershipSourceId
  throw createHttpError(500, 'Membership source could not be resolved')
}
