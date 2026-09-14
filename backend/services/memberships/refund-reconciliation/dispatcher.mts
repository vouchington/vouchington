import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { RefundReconciliationDispatch } from './types.mts'

const RECONCILIATION_LEASE_TTL_SECONDS = 300

/** Claims a fair, bounded batch; jobs carry only durable operation and lease identifiers. */
export async function dispatchDueRefundReconciliations(
  limit = 100,
): Promise<RefundReconciliationDispatch[]> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction(sql`/* dispatchDueRefundReconciliations */
    WITH due AS (
      SELECT id
      FROM membership_operations
      WHERE completed_at IS NULL
        AND operation_kind = 'administrator_refund'
        AND reconciliation_due_at IS NOT NULL
        AND reconciliation_due_at <= CURRENT_TIMESTAMP
        AND (
          execution_claim_token IS NULL
          OR execution_claimed_at < CURRENT_TIMESTAMP - make_interval(secs => ${RECONCILIATION_LEASE_TTL_SECONDS})
        )
      ORDER BY reconciliation_due_at, id
      LIMIT ${Math.min(limit, 100)}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE membership_operations operation
    SET execution_claim_token = uuidv7(), execution_claimed_at = CURRENT_TIMESTAMP,
      failed_at = NULL, failure_message = NULL,
      reconciliation_attempt_ordinal = reconciliation_attempt_ordinal + 1
    FROM due
    WHERE operation.id = due.id
    RETURNING operation.id, operation.execution_claim_token AS "leaseToken"
  `)
  await transaction.commit()
  return rows as RefundReconciliationDispatch[]
}
