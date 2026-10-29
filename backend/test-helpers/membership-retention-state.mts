import { randomUUID } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type RetentionState = {
  operations: number
  attempts: number
  scans: number
  refunds: number
  requests: number
  work: number
  retained: number
  responseSnapshot: unknown
  physicalRows: number
}

export async function getTestMembershipRetentionState(operationId: string) {
  const { rows } = await read<RetentionState>(sql`/* getOwnedMembershipRetentionState */
    WITH state AS (SELECT
      (SELECT count(*)::integer FROM membership_operations WHERE id = ${operationId}) AS operations,
      (SELECT count(*)::integer FROM membership_refund_operation_attempts
        WHERE membership_operation_id = ${operationId}) AS attempts,
      (SELECT count(*)::integer FROM membership_refund_operation_attempt_metadata_scans scan
        JOIN membership_refund_operation_attempts attempt
          ON attempt.id = scan.membership_refund_operation_attempt_id
        WHERE attempt.membership_operation_id = ${operationId}) AS scans,
      (SELECT count(*)::integer FROM membership_refunds
        WHERE membership_operation_id = ${operationId}) AS refunds,
      (SELECT count(*)::integer FROM membership_administrator_refund_operation_requests
        WHERE membership_operation_id = ${operationId}) AS requests,
      (SELECT count(*)::integer FROM membership_operation_execution_work_items
        WHERE membership_operation_id = ${operationId}) AS work,
      (SELECT count(*)::integer FROM membership_operation_retained_identities
        WHERE id = ${operationId}) AS retained,
      (SELECT administrator_response_snapshot FROM membership_operation_retained_identities
        WHERE id = ${operationId}) AS "responseSnapshot")
    SELECT *, operations + attempts + scans + refunds + requests + work AS "physicalRows"
    FROM state`)
  if (!rows[0]) throw new Error('Expected owned financial retention state')
  return rows[0]
}

export async function attemptTestFinancialRetentionShortcut(
  operationId: string,
  target: 'operation' | 'request',
): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* configureFinancialRetentionShortcutProbe */
    SELECT set_config('app.billing_retention_delete', 'on', true),
      set_config('app.payment_ledger_retention_months', '84', true)`)
  if (target === 'operation')
    await query(sql`/* rejectFinancialParentBeforeChildDrain */
      DELETE FROM membership_operations WHERE id = ${operationId}`)
  else
    await query(sql`/* rejectFinancialRequestBeforeReceiptDrain */
      DELETE FROM membership_administrator_refund_operation_requests
      WHERE membership_operation_id = ${operationId}`)
}

export async function attemptTestRetainedMetadataScanWrite(attemptId: string): Promise<void> {
  await write(sql`/* rejectLateRetainedMetadataScan */
    INSERT INTO membership_refund_operation_attempt_metadata_scans (
      membership_refund_operation_attempt_id, lease_token
    ) VALUES (${attemptId}, ${randomUUID()})`)
}

export async function attemptTestRetainedOperationWorkWrite(operationId: string): Promise<void> {
  await write(sql`/* rejectLateRetainedOperationWork */
    INSERT INTO membership_operation_execution_work_items (membership_operation_id)
    VALUES (${operationId})`)
}
