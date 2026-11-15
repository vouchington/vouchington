import { write } from '@data-stores/psql'
import { getStripeRefundRequestRejection } from '@modules/stripe/refund-request-errors'
import sql from 'sql-template-strings'

export async function recordRefundRequestRejection(attemptId: string, err: unknown): Promise<void> {
  const reason = getStripeRefundRequestRejection(err)
  if (!reason) {
    await write(sql`/* recordRefundRequestRejection: unknown outcome */
      UPDATE membership_refund_operation_attempts SET outcome_unknown_at = ${new Date()}
      WHERE id = ${attemptId} AND provider_refund_id IS NULL AND rejected_at IS NULL AND outcome_unknown_at IS NULL`)
    return
  }
  await write(sql`/* recordRefundRequestRejection */
    UPDATE membership_refund_operation_attempts
    SET rejected_at = ${new Date()}, rejection_reason = ${reason}
    WHERE id = ${attemptId} AND provider_refund_id IS NULL AND rejected_at IS NULL AND outcome_unknown_at IS NULL`)
}
