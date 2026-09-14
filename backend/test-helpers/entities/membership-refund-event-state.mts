import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getRefundReceiptCountByProviderRefundIdForTest(
  refundId: string,
): Promise<string | undefined> {
  const { rows } = await read<{ receiptCount: string }>(sql`/* receiptBeforeChargeRefundEventWake */
    SELECT COUNT(*)::TEXT AS "receiptCount" FROM membership_refunds WHERE stripe_refund_id = ${refundId}`)
  return rows[0]?.receiptCount
}

export async function getMatchedChargeRefundedReceiptForTest(options: {
  applicationId: string
  attemptId: string
  refundId: string
}) {
  const { rows } = await read<{
    applicationId: string
    contextMatches: boolean
    due: boolean
    environment: string
    providerRefundId: string | null
    receiptCount: string
  }>(sql`/* matchedChargeRefundedReceipt */
    SELECT attempt.application_id AS "applicationId", attempt.environment,
      attempt.provider_refund_id AS "providerRefundId", operation.reconciliation_due_at <= CURRENT_TIMESTAMP AS due,
      (attempt.membership_operation_id = operation.id AND request.membership_operation_id = operation.id
        AND attempt.provider = 'stripe' AND attempt.environment = 'test' AND attempt.application_id = ${options.applicationId}
        AND operation.provider = 'stripe' AND operation.environment = 'test' AND operation.application_id = ${options.applicationId}
        AND operation.operation_kind = 'administrator_refund' AND attempt.amount_minor_units = receipt.amount_minor_units
        AND attempt.currency_code = receipt.currency_code AND request.amount_minor_units = receipt.amount_minor_units
        AND request.currency_code = receipt.currency_code
        AND request.provider_payment_reference IN (receipt.stripe_charge_id, receipt.stripe_payment_intent_id)) AS "contextMatches",
      (SELECT COUNT(*)::TEXT FROM membership_refunds WHERE stripe_refund_id = ${options.refundId}) AS "receiptCount"
    FROM membership_refund_operation_attempts attempt
    INNER JOIN membership_operations operation ON operation.id = attempt.membership_operation_id
    INNER JOIN membership_administrator_refund_operation_requests request ON request.membership_operation_id = operation.id
    INNER JOIN membership_refunds receipt ON receipt.stripe_refund_id = ${options.refundId}
    WHERE attempt.id = ${options.attemptId}`)
  return rows[0]
}
