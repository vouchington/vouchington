import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type RefundContext = {
  administratorRequestKey: string
  cancelRequested: boolean
  issuedById: string
  membershipId: string
  membershipSourceId: string
  note: string | null
  providerPaymentReference: string
  providerSubscriptionReference: string | null
  reason: string
  requestFingerprint: string
  userId: string
}

export async function getAdministratorRefundContext(
  operationId: string,
): Promise<RefundContext | null> {
  const { rows } = await write(sql`/* getAdministratorRefundReconciliationContext */
    SELECT request.membership_id AS "membershipId", request.issued_by_id AS "issuedById",
      request.provider_payment_reference AS "providerPaymentReference",
      request.provider_subscription_reference AS "providerSubscriptionReference", request.reason,
      request.cancel_requested AS "cancelRequested", request.request_fingerprint AS "requestFingerprint",
      request.administrator_request_key AS "administratorRequestKey",
      request.note, operation.membership_source_id AS "membershipSourceId", membership.user_id AS "userId"
    FROM membership_operations operation
    INNER JOIN membership_administrator_refund_operation_requests request ON request.membership_operation_id = operation.id
    INNER JOIN memberships membership ON membership.id = request.membership_id
    WHERE operation.id = ${operationId}
  `)
  return (rows[0] as RefundContext | undefined) ?? null
}

export async function needsRefundMetadataDiscovery(operationId: string): Promise<boolean> {
  const { rows } = await write(sql`/* needsRefundMetadataDiscovery */
    SELECT attempt.id <= uuidv7(INTERVAL '-23 hours')
      OR scan.completed_at IS NOT NULL AS "unknown"
    FROM membership_refund_operation_attempts attempt
    LEFT JOIN membership_refund_operation_attempt_metadata_scans scan
      ON scan.membership_refund_operation_attempt_id = attempt.id
    WHERE attempt.membership_operation_id = ${operationId} AND attempt.provider_refund_id IS NULL
    ORDER BY attempt.attempt_ordinal DESC LIMIT 1
  `)
  return Boolean((rows[0] as { unknown?: boolean } | undefined)?.unknown)
}

export function paymentLookup(context: RefundContext): {
  chargeId: string | null
  paymentIntentId: string | null
} {
  if (context.providerPaymentReference.startsWith('ch_'))
    return { chargeId: context.providerPaymentReference, paymentIntentId: null }
  return { chargeId: null, paymentIntentId: context.providerPaymentReference }
}

export function paymentCreateLookup(context: RefundContext): {
  chargeId?: string
  paymentIntentId?: string
} {
  const lookup = paymentLookup(context)
  return lookup.chargeId
    ? { chargeId: lookup.chargeId }
    : { paymentIntentId: lookup.paymentIntentId! }
}
