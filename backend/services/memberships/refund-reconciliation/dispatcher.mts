import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { RefundReconciliationDispatch } from './types.mts'

/** Claims a fair, bounded batch; jobs carry only durable operation and lease identifiers. */
export async function dispatchDueRefundReconciliations(
  limit = 100,
): Promise<RefundReconciliationDispatch[]> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction(sql`/* dispatchDueRefundReconciliations */
    WITH due AS (
      SELECT operation.id FROM membership_operations operation
      JOIN membership_operation_execution_work_items work ON work.membership_operation_id = operation.id
      WHERE operation.completed_at IS NULL AND operation.operation_kind = 'administrator_refund'
        AND work.available_at <= clock_timestamp()
        AND (work.lease_token IS NULL OR work.lease_expires_at <= clock_timestamp())
      ORDER BY work.available_at, operation.id LIMIT ${Math.min(limit, 100)}
      FOR UPDATE OF operation SKIP LOCKED
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
    RETURNING operation.id, claimed.lease_token AS "leaseToken"
  `)
  await transaction.commit()
  return rows as RefundReconciliationDispatch[]
}
