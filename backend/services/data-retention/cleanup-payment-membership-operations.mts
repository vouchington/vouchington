import sql from 'sql-template-strings'
import { runCursorCleanupPage } from './cleanup-payment-cursor-page.mts'
import { drainExpiredMembershipOperationChildren } from './cleanup-payment-ledger-children.mts'

/**
 * Reads one page of completed operations in (completed_at, id) order, so a run touches at most
 * pageSize + 1 rows of the partial index. Whether a row is due depends on other tables (an open
 * reversal case), so no index predicate can describe it: the first due row of the page is
 * drained, and a persisted cursor steps past blocked rows instead of re-reading them every
 * day. Scoped runs pick exact ids and skip the cursor.
 */
export function cleanupMembershipOperationPage(
  pageSize: number,
  fiscalCutoff: Date,
  recordIds?: readonly string[],
) {
  return runCursorCleanupPage({
    kind: 'membership_operation_ledger',
    pageSize,
    recordIds,
    permitDelete: query =>
      query(
        sql`/* permitExpiredMembershipOperationDelete */ SET LOCAL app.billing_retention_delete = 'on'`,
      ),
    selectPage: async (query, cursorId) => {
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
      return (await query<{ id: string; due: boolean }>(statement)).rows
    },
    lockDue: async (query, dueId) => {
      const { rows } = await query<{ id: string }>(sql`/* lockExpiredMembershipOperationLedger */
        SELECT operation.id FROM membership_operations operation WHERE operation.id = ${dueId}
          AND fn_membership_operation_fiscal_retention_due(operation.id)
        FOR UPDATE OF operation SKIP LOCKED`)
      return rows[0]?.id
    },
    drainChildren: async (query, operationId) => {
      await query(sql`/* recordExpiredMembershipOperationDrain */
        UPDATE membership_operations operation
        SET fiscal_retention_started_at = clock_timestamp()
        WHERE operation.id = ${operationId}
          AND operation.fiscal_retention_started_at IS NULL`)
      return drainExpiredMembershipOperationChildren(query, operationId, pageSize)
    },
    deleteRoot: async (query, operationId) => {
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
      return result.rowCount ?? 0
    },
  })
}
