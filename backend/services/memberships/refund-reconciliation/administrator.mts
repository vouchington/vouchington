import createHttpError from 'http-errors'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  getLatestMembershipByUserId,
  getStripeSubscriptionIdByMembershipSourceId,
} from '../get.mts'
import {
  createRefundRequestFingerprint,
  createStripeRefundIdempotencyKey,
  type MembershipRefundRequestIntent,
} from '../refund-idempotency.mts'
import { getValidatedRefundableCharge, requireMembershipSourceId } from '../refund-target.mts'
import type { MembershipStripeOperations } from '../refund-stripe-operations.mts'
import {
  claimAdministratorRefundRequest,
  getAdministratorRefundRequestByKey,
} from './administrator-request.mts'
import { leaseDueRefundReconciliation } from './ledger.mts'
import { reconcileMembershipRefundOperation } from './reconcile.mts'
import type { RefundReconciliationResult } from './types.mts'

export async function startAdministratorRefundReconciliation(
  currentUserId: string,
  request: MembershipRefundRequestIntent,
  stripeOperations: Pick<MembershipStripeOperations, 'listSubscriptionInvoices'>,
): Promise<{ id: string; result: RefundReconciliationResult }> {
  const idempotencyKey = createStripeRefundIdempotencyKey(currentUserId, request.idempotencyToken)
  const existingRequest = await getAdministratorRefundRequestByKey(idempotencyKey, {
    provider: 'stripe',
    providerApplicationId: 'voucha-web',
    providerEnvironment: STRIPE_PROVIDER_ENVIRONMENT,
  })
  if (existingRequest) {
    const requestFingerprint = createRefundRequestFingerprint(existingRequest.membershipId, request)
    if (
      existingRequest.issuedById !== currentUserId ||
      existingRequest.requestFingerprint !== requestFingerprint
    ) {
      throw createHttpError(
        409,
        'Administrator refund idempotency key was reused for a different request',
      )
    }
    return reconcileAdministratorRefundOperation(existingRequest.id)
  }
  const membership = await getLatestMembershipByUserId(request.targetUserId)
  if (!membership) throw createHttpError(404, 'Membership not found')
  const membershipSourceId = await requireMembershipSourceId(membership.id)
  const providerSubscriptionReference = request.cancel
    ? await getStripeSubscriptionIdByMembershipSourceId(membershipSourceId)
    : null
  if (request.cancel && !providerSubscriptionReference)
    throw createHttpError(409, 'Membership has no cancellable provider subscription')
  const target = await getValidatedRefundableCharge(
    membershipSourceId,
    request,
    stripeOperations as MembershipStripeOperations,
  )
  const remaining = target.match.amount.amount - target.match.amount_refunded.amount
  const amount = request.amount ?? { amount: remaining, currency: target.match.amount.currency }
  if (amount.amount <= 0) throw createHttpError(400, 'Charge has already been fully refunded')
  if (amount.amount > remaining)
    throw createHttpError(
      400,
      `Refund amount exceeds remaining refundable amount of ${remaining} minor units`,
    )
  if (amount.currency !== target.match.amount.currency)
    throw createHttpError(400, 'Refund currency must match the refundable charge currency')
  const operation = await claimAdministratorRefundRequest({
    amount,
    cancelRequested: request.cancel,
    idempotencyKey,
    issuedById: currentUserId,
    membershipId: membership.id,
    note: request.note ?? null,
    // The selected payment summary does not carry invoice period boundaries. Keep this unknown
    // rather than inventing audit facts at request time.
    periodEndsAt: null,
    periodStartedAt: null,
    providerPaymentReference: target.match.charge_id ?? target.match.payment_intent_id!,
    providerSubscriptionReference,
    reason: request.reason,
    requestFingerprint: createRefundRequestFingerprint(membership.id, request),
  })
  return reconcileAdministratorRefundOperation(operation.id)
}

async function reconcileAdministratorRefundOperation(
  operationId: string,
): Promise<{ id: string; result: RefundReconciliationResult }> {
  const lease = await leaseDueRefundReconciliation(operationId)
  if (lease)
    await reconcileMembershipRefundOperation({ id: lease.id, leaseToken: lease.leaseToken })
  const result = await getAdministratorRefundReconciliationResult(operationId)
  return { id: operationId, result }
}

export async function getAdministratorRefundReconciliationResult(
  operationId: string,
): Promise<RefundReconciliationResult> {
  const { rows } = await write(sql`/* getAdministratorRefundReconciliationResult */
    SELECT receipt.id AS "refundId", request.cancel_requested AS "cancelRequested",
      receipt.revoked_access AS "revokedAccess", operation.completed_at IS NOT NULL AS completed
    FROM membership_operations operation
    INNER JOIN membership_administrator_refund_operation_requests request
      ON request.membership_operation_id = operation.id
    LEFT JOIN membership_refunds receipt ON receipt.membership_operation_id = operation.id
    WHERE operation.id = ${operationId}
  `)
  const row = rows[0] as
    | {
        refundId: string | null
        cancelRequested: boolean
        revokedAccess: boolean | null
        completed: boolean
      }
    | undefined
  if (!row || !row.refundId) return { outcome: 'reconciling' }
  return {
    outcome: 'completed',
    refundId: row.refundId,
    cancellationStatus: !row.cancelRequested
      ? 'not_requested'
      : row.revokedAccess
        ? 'completed'
        : 'pending',
  }
}
