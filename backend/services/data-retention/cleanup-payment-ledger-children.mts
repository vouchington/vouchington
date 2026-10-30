import type { TransactionQuery } from '@data-stores/psql'

/** The caller owns the operation's producer identity and parent row locks. */
export async function drainExpiredMembershipOperationChildren(
  query: TransactionQuery,
  operationId: string,
  pageSize: number,
): Promise<number> {
  const { rows: attempts } = await query<{ id: string }>(
    `/* listExpiredMembershipRefundAttempts */
     SELECT id FROM membership_refund_operation_attempts
     WHERE membership_operation_id = $1
     ORDER BY attempt_ordinal LIMIT $2 FOR UPDATE`,
    [operationId, pageSize],
  )
  const attemptIds = attempts.map(attempt => attempt.id)
  const scans = await query(
    `/* deleteExpiredMembershipRefundMetadataScans */
     DELETE FROM membership_refund_operation_attempt_metadata_scans
     WHERE membership_refund_operation_attempt_id = ANY($1::uuid[])`,
    [attemptIds],
  )
  let deleted = scans.rowCount ?? 0
  const drainedAttempts = await query(
    `/* deleteExpiredMembershipRefundAttempts */
     /* no-mistakes: deadlock-safe -- the locked parent and its unique attempt ordinal determine the bounded child order. */
     WITH pending AS (
       SELECT attempt.id FROM membership_refund_operation_attempts attempt
       WHERE attempt.membership_operation_id = $1
         AND attempt.id = ANY($2::uuid[])
         AND NOT EXISTS (SELECT 1 FROM membership_refund_operation_attempt_metadata_scans scan
           WHERE scan.membership_refund_operation_attempt_id = attempt.id)
       ORDER BY attempt.attempt_ordinal LIMIT $3 FOR UPDATE
     )
     DELETE FROM membership_refund_operation_attempts attempt
     USING pending WHERE attempt.id = pending.id`,
    [operationId, attemptIds, pageSize - deleted],
  )
  deleted += drainedAttempts.rowCount ?? 0
  const refunds = await query(
    `/* deleteExpiredMembershipRefundReceipts */
     WITH pending AS (
       SELECT refund.id FROM membership_refunds refund
       WHERE refund.membership_operation_id = $1
         AND NOT EXISTS (SELECT 1 FROM membership_refund_operation_attempts attempt
           WHERE attempt.membership_operation_id = $1)
       ORDER BY refund.id LIMIT $2 FOR UPDATE
     )
     DELETE FROM membership_refunds refund USING pending WHERE refund.id = pending.id`,
    [operationId, pageSize - deleted],
  )
  deleted += refunds.rowCount ?? 0
  const requests = await query(
    `/* deleteExpiredMembershipAdministratorRefundRequests */
     WITH pending AS (
       SELECT request.id FROM membership_administrator_refund_operation_requests request
       WHERE request.membership_operation_id = $1
         AND NOT EXISTS (SELECT 1 FROM membership_refund_operation_attempts attempt
           WHERE attempt.membership_operation_id = $1)
         AND NOT EXISTS (SELECT 1 FROM membership_refunds refund
           WHERE refund.membership_operation_id = $1)
       ORDER BY request.id LIMIT $2 FOR UPDATE
     )
     DELETE FROM membership_administrator_refund_operation_requests request
     USING pending WHERE request.id = pending.id`,
    [operationId, pageSize - deleted],
  )
  return deleted + (requests.rowCount ?? 0)
}
