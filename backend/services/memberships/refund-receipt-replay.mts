import createHttpError from 'http-errors'
import type { CancelSubscriptionImmediatelyPayload } from '@modules/stripe/operations'
import { getStripeSubscriptionIdByMembershipSourceId } from './get.mts'
import { resumeMembershipRefundCancellation } from './refund-cancellation.mts'
import {
  createRefundRequestFingerprint,
  type MembershipRefundRequestIntent,
} from './refund-idempotency.mts'
import type { MembershipRefund } from './types.mts'
import { omitMembershipRefundLedgerSource } from './refund-row-mapping.mts'

export async function replayMembershipRefundReceipt(options: {
  refund: MembershipRefund
  currentUserId: string
  request: MembershipRefundRequestIntent
  stripeIdempotencyKey: string
  membershipSourceId: string
  cancelSubscriptionImmediately: (payload: CancelSubscriptionImmediatelyPayload) => Promise<null>
}): Promise<MembershipRefund> {
  const requestFingerprint = createRefundRequestFingerprint(
    options.refund.membership_id,
    options.request,
  )
  if (options.refund.admin_request_fingerprint !== requestFingerprint) {
    throw createHttpError(409, 'Idempotency key was already used for a different refund request')
  }
  const membership = { id: options.refund.membership_id }
  const stripeSubscriptionId = await getStripeSubscriptionIdByMembershipSourceId(
    options.membershipSourceId,
  )
  const refund = await resumeMembershipRefundCancellation(
    options.refund,
    membership,
    options.currentUserId,
    options.request,
    options.stripeIdempotencyKey,
    requestFingerprint,
    options.membershipSourceId,
    stripeSubscriptionId,
    options.cancelSubscriptionImmediately,
  )
  return omitMembershipRefundLedgerSource({
    ...refund,
    membership_source_id: options.membershipSourceId,
  })
}
