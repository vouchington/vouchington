import { beginTransaction } from '@data-stores/psql'
import * as stripeSubscriptions from '@modules/stripe/subscriptions'
import sql from 'sql-template-strings'
import { recordMembershipChange } from '../changes.mts'
import {
  getAdministratorRefundContext,
  paymentCreateLookup,
  paymentLookup,
  type RefundContext,
} from './context.mts'
import { getMembershipSourceCancelledAt } from '../get.mts'
import { completeRefundReconciliation } from './ledger.mts'
import { updateMembershipFromEvent } from '../update.mts'
import type { RefundReconciliationLease } from './types.mts'
import type { RefundReconciliationPolicy } from './reconcile.mts'

export const administratorRefundPolicy: RefundReconciliationPolicy<RefundContext> = {
  complete: recordSucceededAdministratorRefundReceipt,
  createLookup: paymentCreateLookup,
  getContext: getAdministratorRefundContext,
  lookup: paymentLookup,
  providerFailuresAreDurable: true,
  providerIdempotencyKey(lease) {
    return `voucha-membership-refund-reconciliation:${lease.id}:${lease.attemptOrdinal}`
  },
}

async function recordSucceededAdministratorRefundReceipt(
  lease: RefundReconciliationLease,
  context: RefundContext,
  refund: {
    amount: number
    charge: string | { id: string } | null
    currency: string
    id: string
    payment_intent: string | { id: string } | null
  },
): Promise<'completed' | 'pending'> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* recordAdministratorRefundReceipt */
    INSERT INTO membership_refunds (
      membership_operation_id, membership_id, membership_source_id, user_id, stripe_refund_id,
      stripe_charge_id, stripe_payment_intent_id, stripe_idempotency_key, admin_request_fingerprint,
      amount_minor_units, currency_code, reason, revoked_access, issued_by_id, source, stripe_event_id, note
    ) VALUES (
      ${lease.id}, ${context.membershipId}, ${context.membershipSourceId}, ${context.userId}, ${refund.id},
      ${expandableId(refund.charge) ?? context.providerPaymentReference}, ${expandableId(refund.payment_intent)},
      ${context.administratorRequestKey}, ${context.requestFingerprint}, ${refund.amount}, ${refund.currency},
      ${context.reason}, FALSE, ${context.issuedById}, 'admin', NULL, ${context.note}
    ) ON CONFLICT (stripe_refund_id) DO UPDATE
    SET membership_operation_id = EXCLUDED.membership_operation_id,
      stripe_idempotency_key = EXCLUDED.stripe_idempotency_key,
      admin_request_fingerprint = EXCLUDED.admin_request_fingerprint,
      reason = EXCLUDED.reason, issued_by_id = EXCLUDED.issued_by_id,
      source = 'admin', note = EXCLUDED.note
    WHERE membership_refunds.membership_operation_id IS NULL
      AND membership_refunds.source = 'stripe_dashboard'
  `)
  if (!context.cancelRequested) await completeRefundReconciliation(lease, transaction)
  await transaction.commit()
  if (!context.cancelRequested) return 'completed'
  return convergeAdministratorRefundCancellation(lease, context)
}

async function convergeAdministratorRefundCancellation(
  lease: RefundReconciliationLease,
  context: RefundContext,
): Promise<'completed' | 'pending'> {
  try {
    await stripeSubscriptions.cancelStripeSubscriptionImmediately(
      context.providerSubscriptionReference!,
    )
  } catch {
    return 'pending'
  }
  await using transaction = await beginTransaction()
  await transaction(sql`/* revokeAdministratorRefundAccess */
    UPDATE membership_refunds
    SET revoked_access = TRUE
    WHERE membership_operation_id = ${lease.id} AND revoked_access = FALSE
  `)
  const membershipUpdate = await updateMembershipFromEvent(
    {
      membershipId: context.membershipId,
      membershipSourceId: context.membershipSourceId,
      query: transaction,
      status: 'cancelled',
    },
    async (updated, query) => {
      await recordMembershipChange({
        cancelledAt: updated.current.cancelled_at,
        changedById: context.issuedById,
        changeType: 'refund',
        membershipId: context.membershipId,
        membershipSourceId: context.membershipSourceId,
        note: context.note,
        query,
        userId: context.userId,
      })
      return false
    },
  )
  if (!membershipUpdate) {
    await recordMembershipChange({
      cancelledAt: await getMembershipSourceCancelledAt(context.membershipSourceId, transaction),
      changedById: context.issuedById,
      changeType: 'refund',
      membershipId: context.membershipId,
      membershipSourceId: context.membershipSourceId,
      note: context.note,
      query: transaction,
      userId: context.userId,
    })
  }
  await completeRefundReconciliation(lease, transaction)
  await transaction.commit()
  return 'completed'
}

function expandableId(value: string | { id: string } | null): string | null {
  return typeof value === 'string' ? value : (value?.id ?? null)
}
