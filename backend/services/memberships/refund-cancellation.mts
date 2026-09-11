import { beginTransaction } from '@data-stores/psql'
import onError from '@modules/on-error'
import type { CancelSubscriptionImmediatelyPayload } from '@modules/stripe/operations'
import { recordMembershipChange } from './changes.mts'
import type { MembershipRefundRequestIntent } from './refund-idempotency.mts'
import {
  getMembershipRefundByStripeIdempotencyKey,
  MembershipRefundRequestConflictError,
  transitionMembershipRefundRevokedAccess,
} from './refunds.mts'
import type { Membership, MembershipRefund } from './types.mts'
import { updateMembershipFromWebhook } from './update.mts'
import { getMembershipSourceCancelledAt } from './get.mts'
import { omitMembershipRefundLedgerSource } from './refund-row-mapping.mts'

export async function resumeMembershipRefundCancellation(
  refund: MembershipRefund,
  membership: Pick<Membership, 'id'>,
  currentUserId: string,
  options: MembershipRefundRequestIntent,
  stripeIdempotencyKey: string,
  requestFingerprint: string,
  membershipSourceId: string,
  stripeSubscriptionId: string | null,
  cancelSubscriptionImmediately: (payload: CancelSubscriptionImmediatelyPayload) => Promise<null>,
): Promise<MembershipRefund> {
  if (!options.cancel || refund.revoked_access) return refund
  if (!stripeSubscriptionId) return refund

  try {
    await cancelSubscriptionImmediately({
      subscriptionId: stripeSubscriptionId,
    })
    await using transaction = await beginTransaction()
    const resumeRefundCancellationInTransaction = async (query: typeof transaction) => {
      const winner = await transitionMembershipRefundRevokedAccess(
        stripeIdempotencyKey,
        requestFingerprint,
        query,
      )
      if (!winner) {
        const current = await getMembershipRefundByStripeIdempotencyKey(stripeIdempotencyKey, query)
        if (!current || current.admin_request_fingerprint !== requestFingerprint) {
          throw new MembershipRefundRequestConflictError()
        }
        return omitMembershipRefundLedgerSource(current)
      }
      const membershipUpdate = await updateMembershipFromWebhook(
        {
          membershipId: membership.id,
          membershipSourceId,
          status: 'cancelled',
          query,
        },
        async (updated, transaction) => {
          await recordMembershipChange({
            membershipId: membership.id,
            userId: options.targetUserId,
            membershipSourceId,
            changeType: 'refund',
            changedById: currentUserId,
            cancelledAt: updated.current.cancelled_at,
            note: options.note ?? null,
            query: transaction,
          })
          return false
        },
      )
      if (membershipUpdate) return winner

      await recordMembershipChange({
        membershipId: membership.id,
        userId: options.targetUserId,
        membershipSourceId,
        changeType: 'refund',
        changedById: currentUserId,
        cancelledAt: await getMembershipSourceCancelledAt(membershipSourceId, query),
        note: options.note ?? null,
        query,
      })
      return winner
    }
    const result = await resumeRefundCancellationInTransaction(transaction)
    await transaction.commit()
    return result
  } catch (error) {
    const cancellationError = error instanceof Error ? error : new Error(String(error))
    onError(cancellationError)
    return refund
  }
}
