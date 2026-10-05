import { randomUUID } from 'node:crypto'
import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function claimMembershipOperationExecutionWork(
  operationId: string,
  query: QueryExecutor,
  reconciliation = false,
): Promise<string | null> {
  const leaseToken = randomUUID()
  const { rows } = await query(sql`/* claimMembershipOperationExecutionWork */
    WITH candidate AS (
      SELECT operation.id FROM membership_operations operation
      JOIN membership_operation_execution_work_items work ON work.membership_operation_id = operation.id
      WHERE operation.id = ${operationId} AND operation.completed_at IS NULL
        AND work.available_at <= clock_timestamp()
        AND (work.lease_token IS NULL OR work.lease_expires_at <= clock_timestamp())
      FOR UPDATE OF operation
    ), claimed AS (
      UPDATE membership_operation_execution_work_items work
      SET lease_token = ${leaseToken}, leased_at = clock_timestamp(),
        lease_expires_at = clock_timestamp() + INTERVAL '5 minutes', attempt_count = attempt_count + 1
      FROM candidate WHERE work.membership_operation_id = candidate.id
        AND (work.lease_token IS NULL OR work.lease_expires_at <= clock_timestamp())
      RETURNING work.membership_operation_id
    )
    UPDATE membership_operations operation SET failed_at = NULL, failure_message = NULL,
      reconciliation_attempt_ordinal = reconciliation_attempt_ordinal + CASE WHEN ${reconciliation} THEN 1 ELSE 0 END
    FROM claimed WHERE operation.id = claimed.membership_operation_id
    RETURNING operation.id
  `)
  return rows.length === 1 ? leaseToken : null
}
