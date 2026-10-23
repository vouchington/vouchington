import { read } from '@data-stores/psql'
import { parsePostgresMoneyAmount } from '@vouchington/utils/money'
import sql from 'sql-template-strings'
import type { MembershipRefund } from '../../services/memberships/types.mts'

type MembershipRefundRow = Omit<MembershipRefund, 'amount'> & {
  amount_minor_units: string
  currency_code: string
}

export async function getTestMembershipRefunds(userId: string): Promise<MembershipRefund[]> {
  const { rows } = await read(sql`/* getTestMembershipRefunds */
    SELECT id, membership_id, user_id, stripe_refund_id, stripe_charge_id,
      stripe_payment_intent_id, stripe_idempotency_key, admin_request_fingerprint,
      amount_minor_units, currency_code, reason, has_revoked_access, issued_by_id,
      source, stripe_event_id, note, created_at
    FROM membership_refunds
    WHERE user_id = ${userId}
    ORDER BY id DESC
  `)
  return (rows as MembershipRefundRow[]).map(mapMembershipRefund)
}

function mapMembershipRefund(row: MembershipRefundRow): MembershipRefund {
  const { amount_minor_units, currency_code, ...refund } = row
  return {
    ...refund,
    amount: {
      amount: parsePostgresMoneyAmount(amount_minor_units),
      currency: currency_code,
    },
  }
}

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
    SELECT context.application_id AS "applicationId", context.environment,
      attempt.provider_refund_id AS "providerRefundId", work.available_at <= CURRENT_TIMESTAMP AS due,
      (attempt.membership_operation_id = operation.id AND request.membership_operation_id = operation.id
        AND attempt.membership_provider_context_id = operation.membership_provider_context_id
        AND context.provider = 'stripe' AND context.environment = 'test' AND context.application_id = ${options.applicationId}
        AND operation.operation_kind = 'administrator_refund' AND attempt.amount_minor_units = receipt.amount_minor_units
        AND attempt.currency_code::text = receipt.currency_code AND request.amount_minor_units = receipt.amount_minor_units
        AND request.currency_code::text = receipt.currency_code
        AND request.provider_payment_reference IN (receipt.stripe_charge_id, receipt.stripe_payment_intent_id)) AS "contextMatches",
      (SELECT COUNT(*)::TEXT FROM membership_refunds WHERE stripe_refund_id = ${options.refundId}) AS "receiptCount"
    FROM membership_refund_operation_attempts attempt
    INNER JOIN membership_operations operation ON operation.id = attempt.membership_operation_id
    INNER JOIN membership_provider_contexts context ON context.id = operation.membership_provider_context_id
    INNER JOIN membership_operation_execution_work_items work ON work.membership_operation_id = operation.id
    INNER JOIN membership_administrator_refund_operation_requests request ON request.membership_operation_id = operation.id
    INNER JOIN membership_refunds receipt ON receipt.stripe_refund_id = ${options.refundId}
    WHERE attempt.id = ${options.attemptId}`)
  return rows[0]
}
