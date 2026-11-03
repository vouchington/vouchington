import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { drainExpiredMembershipOperationChildren } from './cleanup-payment-ledger-children.mts'
import {
  lockPaymentCleanupCursor,
  savePaymentCleanupCursor,
} from './cleanup-payment-operations.mts'

/**
 * Reads one page of completed operations in (completed_at, id) order, so a run touches at most
 * pageSize + 1 rows of the partial index. Whether a row is due depends on other tables (an open
 * reversal case), so no index predicate can describe it: the first due row of the page is
 * drained, and a persisted cursor steps past blocked rows instead of re-reading them every
 * day. A completed pass resets the cursor so rows that become due later are revisited. Scoped
 * runs pick exact ids and skip the cursor.
 */
export async function cleanupMembershipOperationPage(
  pageSize: number,
  fiscalCutoff: Date,
  recordIds?: readonly string[],
) {
  await using query = await beginTransaction()
  await query(
    sql`/* permitExpiredMembershipOperationDelete */ SET LOCAL app.billing_retention_delete = 'on'`,
  )
  const cursorId = recordIds
    ? null
    : await lockPaymentCleanupCursor(query, 'membership_operation_ledger')
  const statement = sql`/* selectExpiredMembershipOperationLedgerPage */
    SELECT operation.id, fn_membership_operation_fiscal_retention_due(operation.id) AS due
    FROM membership_operations operation
    WHERE operation.completed_at IS NOT NULL AND operation.completed_at < ${fiscalCutoff}`
  if (recordIds) statement.append(sql` AND operation.id = ANY(${[...recordIds]}::uuid[])`)
  else if (cursorId)
    statement.append(sql` AND (operation.completed_at, operation.id) > (
      SELECT after.completed_at, after.id FROM membership_operations after WHERE after.id = ${cursorId}::uuid)`)
  statement.append(sql`
    ORDER BY operation.completed_at, operation.id
    LIMIT ${pageSize + 1}`)
  const { rows } = await query<{ id: string; due: boolean }>(statement)
  const page = rows.slice(0, pageSize)
  const dueIndex = page.findIndex(row => row.due)
  const dueId = dueIndex < 0 ? undefined : page[dueIndex]!.id
  const { rows: locked } = dueId
    ? await query<{ id: string }>(sql`/* lockExpiredMembershipOperationLedger */
        SELECT operation.id FROM membership_operations operation WHERE operation.id = ${dueId}
          AND fn_membership_operation_fiscal_retention_due(operation.id)
        FOR UPDATE OF operation SKIP LOCKED`)
    : { rows: [] }
  const operationId = locked[0]?.id
  let deleted = 0
  let rootDeleted = 0
  if (operationId) {
    await query(sql`/* recordExpiredMembershipOperationDrain */
      UPDATE membership_operations operation
      SET fiscal_retention_started_at = clock_timestamp()
      WHERE operation.id = ${operationId}
        AND operation.fiscal_retention_started_at IS NULL`)
    deleted = await drainExpiredMembershipOperationChildren(query, operationId, pageSize)
    if (deleted < pageSize) {
      const result = await query(sql`/* deleteExpiredMembershipOperationLedger */
        DELETE FROM membership_operations operation WHERE operation.id = ${operationId}
          AND fn_membership_operation_fiscal_retention_due(operation.id)
          AND NOT EXISTS (SELECT 1 FROM membership_refund_operation_attempts attempt
            WHERE attempt.membership_operation_id = operation.id)
          AND NOT EXISTS (SELECT 1 FROM membership_refunds refund
            WHERE refund.membership_operation_id = operation.id)
          AND NOT EXISTS (SELECT 1 FROM membership_automatic_refund_receipts receipt
            WHERE receipt.membership_operation_id = operation.id)
          AND NOT EXISTS (SELECT 1 FROM membership_ineligible_purchase_reversal_case_operations link
            WHERE link.membership_operation_id = operation.id)
          AND NOT EXISTS (SELECT 1 FROM membership_administrator_refund_operation_requests request
            WHERE request.membership_operation_id = operation.id)`)
      rootDeleted = result.rowCount ?? 0
      deleted += rootDeleted
    }
  }
  // Blocked rows before the drained row are passed over for the rest of the pass; the drained row
  // is revisited until it is gone, so the cursor never moves onto or past it.
  const hasMore = operationId
    ? rootDeleted === 0 || rows.length > dueIndex + 1
    : rows.length > pageSize
  if (!recordIds)
    await savePaymentCleanupCursor(
      query,
      'membership_operation_ledger',
      hasMore ? (page[(operationId ? dueIndex : page.length) - 1]?.id ?? cursorId) : null,
    )
  await query.commit()
  return { scanned: page.length, deleted, hasMore }
}
