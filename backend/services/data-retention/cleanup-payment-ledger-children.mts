import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Delete one operation's joined rows in FK order, counting every physical row against the page. */
export async function drainExpiredMembershipOperationChildren(
  query: TransactionQuery,
  operationId: string,
  pageSize: number,
): Promise<number> {
  let remaining = pageSize
  const scans = await query(sql`/* deleteExpiredMembershipRefundMetadataScans */
    WITH pending AS (
      SELECT scan.membership_refund_operation_attempt_id FROM membership_refund_operation_attempt_metadata_scans scan
      JOIN membership_refund_operation_attempts attempt
        ON attempt.id = scan.membership_refund_operation_attempt_id
      WHERE attempt.membership_operation_id = ${operationId}
      ORDER BY scan.membership_refund_operation_attempt_id LIMIT ${remaining} FOR UPDATE OF scan
    ) DELETE FROM membership_refund_operation_attempt_metadata_scans scan
    USING pending WHERE scan.membership_refund_operation_attempt_id = pending.membership_refund_operation_attempt_id`)
  remaining -= scans.rowCount ?? 0
  if (remaining === 0) return pageSize

  const attempts = await query(sql`/* deleteExpiredMembershipRefundAttempts */
    WITH pending AS (
      SELECT attempt.id FROM membership_refund_operation_attempts attempt
      WHERE attempt.membership_operation_id = ${operationId}
        AND NOT EXISTS (SELECT 1 FROM membership_refund_operation_attempt_metadata_scans scan
          WHERE scan.membership_refund_operation_attempt_id = attempt.id)
      ORDER BY attempt.attempt_ordinal LIMIT ${remaining} FOR UPDATE OF attempt
    ) DELETE FROM membership_refund_operation_attempts attempt
    USING pending WHERE attempt.id = pending.id`)
  remaining -= attempts.rowCount ?? 0
  if (remaining === 0) return pageSize

  const refunds = await query(sql`/* deleteExpiredMembershipRefundReceipts */
    WITH pending AS (
      SELECT refund.id FROM membership_refunds refund
      WHERE refund.membership_operation_id = ${operationId}
        AND NOT EXISTS (SELECT 1 FROM membership_refund_operation_attempts attempt
          WHERE attempt.membership_operation_id = ${operationId})
      ORDER BY refund.id LIMIT ${remaining} FOR UPDATE OF refund
    ) DELETE FROM membership_refunds refund USING pending WHERE refund.id = pending.id`)
  remaining -= refunds.rowCount ?? 0
  if (remaining === 0) return pageSize

  const receipts = await query(sql`/* deleteExpiredMembershipAutomaticRefundReceipts */
    WITH pending AS (
      SELECT receipt.id FROM membership_automatic_refund_receipts receipt
      WHERE receipt.membership_operation_id = ${operationId}
      ORDER BY receipt.id LIMIT ${remaining} FOR UPDATE OF receipt
    ) DELETE FROM membership_automatic_refund_receipts receipt USING pending WHERE receipt.id = pending.id`)
  remaining -= receipts.rowCount ?? 0
  if (remaining === 0) return pageSize

  const caseLinks = await query(sql`/* deleteExpiredMembershipReversalCaseLinks */
    WITH pending AS (
      SELECT link.membership_ineligible_purchase_reversal_case_id AS case_id
      FROM membership_ineligible_purchase_reversal_case_operations link
      WHERE link.membership_operation_id = ${operationId}
      ORDER BY link.membership_ineligible_purchase_reversal_case_id LIMIT ${remaining} FOR UPDATE OF link
    ) DELETE FROM membership_ineligible_purchase_reversal_case_operations link USING pending
      WHERE link.membership_operation_id = ${operationId}
        AND link.membership_ineligible_purchase_reversal_case_id = pending.case_id`)
  remaining -= caseLinks.rowCount ?? 0
  if (remaining === 0) return pageSize

  const requests = await query(sql`/* deleteExpiredMembershipAdministratorRefundRequests */
    WITH pending AS (
      SELECT request.id FROM membership_administrator_refund_operation_requests request
      WHERE request.membership_operation_id = ${operationId}
        AND NOT EXISTS (SELECT 1 FROM membership_refund_operation_attempts attempt
          WHERE attempt.membership_operation_id = ${operationId})
        AND NOT EXISTS (SELECT 1 FROM membership_refunds refund
          WHERE refund.membership_operation_id = ${operationId})
      ORDER BY request.id LIMIT ${remaining} FOR UPDATE OF request
    ) DELETE FROM membership_administrator_refund_operation_requests request
    USING pending WHERE request.id = pending.id`)
  return pageSize - remaining + (requests.rowCount ?? 0)
}
