import createHttpError from 'http-errors'
import {
  getMembershipSourceIdByMembershipId,
  getStripeSubscriptionIdByMembershipSourceId,
} from './get.mts'
import { type MembershipRefundRequestIntent } from './refund-idempotency.mts'
import {
  listRefundableChargesForSubscription,
  matchesRefundRequest,
  type MembershipStripeOperations,
} from './refund-stripe-operations.mts'
import type { RefundableCharge } from './types.mts'

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

export async function requireMembershipSourceId(membershipId: string): Promise<string> {
  const membershipSourceId = await getMembershipSourceIdByMembershipId(membershipId)
  if (membershipSourceId) return membershipSourceId
  throw createHttpError(500, 'Membership source could not be resolved')
}
