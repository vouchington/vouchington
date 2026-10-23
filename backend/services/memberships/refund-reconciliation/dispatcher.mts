import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { RefundReconciliationDispatch } from './types.mts'
import { getMembershipWorkLimit } from '../work-limits.mts'

/** Claims a fair, bounded batch; jobs carry only durable operation and lease identifiers. */
export async function dispatchDueRefundReconciliations(
  limit = getMembershipWorkLimit('refund_reconciliation_batch_size'),
): Promise<{ dispatches: RefundReconciliationDispatch[]; hasMore: boolean }> {
  const batchSize = Math.min(limit, getMembershipWorkLimit('refund_reconciliation_batch_size'))
  await using transaction = await beginTransaction()
  const { rows } = await transaction<RefundReconciliationDispatch & { hasMore: boolean }>(
    sql`/* dispatchDueRefundReconciliations */
    WITH due_candidates AS (
      SELECT operation.id, work.available_at FROM membership_operations operation
      JOIN membership_operation_execution_work_items work ON work.membership_operation_id = operation.id
      WHERE operation.completed_at IS NULL AND operation.operation_kind = 'administrator_refund'
        AND work.available_at <= clock_timestamp()
        AND (work.lease_token IS NULL OR work.lease_expires_at <= clock_timestamp())
      ORDER BY work.available_at, operation.id LIMIT ${batchSize + 1}
      FOR UPDATE OF operation SKIP LOCKED
    ), due AS (
      SELECT id FROM due_candidates ORDER BY available_at, id LIMIT ${batchSize}
    ), claimed AS (
      UPDATE membership_operation_execution_work_items work
      SET lease_token = uuidv7(), leased_at = clock_timestamp(),
        lease_expires_at = clock_timestamp() + INTERVAL '5 minutes', attempt_count = attempt_count + 1
      FROM due WHERE work.membership_operation_id = due.id
        AND (work.lease_token IS NULL OR work.lease_expires_at <= clock_timestamp())
      RETURNING work.membership_operation_id, work.lease_token
    )
    UPDATE membership_operations operation SET failed_at = NULL, failure_message = NULL,
      reconciliation_attempt_ordinal = reconciliation_attempt_ordinal + 1
    FROM claimed WHERE operation.id = claimed.membership_operation_id
    RETURNING operation.id, claimed.lease_token AS "leaseToken",
      (SELECT COUNT(*) FROM due_candidates) > ${batchSize} AS "hasMore"
  `,
  )
  await transaction.commit()
  return {
    dispatches: rows.map(({ hasMore: _, ...dispatch }) => dispatch),
    hasMore: rows.at(0)?.hasMore ?? false,
  }
}
