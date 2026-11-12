import sql from 'sql-template-strings'
import { drainExpiredMembershipReversalCaseChildren } from './cleanup-payment-reversal-case-children.mts'
import { runCursorCleanupPage } from './cleanup-payment-cursor-page.mts'

/**
 * Reads one page of reversal cases in (collision_at, id) order, so a run touches at most
 * pageSize + 1 rows of the index. Whether a case is expired depends on other tables (closed state,
 * remaining operations), so the first expired case of the page is drained and a persisted cursor
 * steps past blocked cases. Scoped runs pick exact ids.
 */
export function cleanupMembershipReversalCasePage(
  pageSize: number,
  fiscalCutoff: Date,
  recordIds?: readonly string[],
) {
  return runCursorCleanupPage({
    kind: 'membership_reversal_case_ledger',
    pageSize,
    recordIds,
    permitDelete: query =>
      query(
        sql`/* permitExpiredMembershipReversalCaseDelete */ SET LOCAL app.billing_retention_delete = 'on'`,
      ),
    selectPage: async (query, cursorId) => {
      const statement = sql`/* selectExpiredMembershipReversalCasePage */
        SELECT reversal_case.id, fn_membership_reversal_case_expired(reversal_case.id) AS due
        FROM membership_ineligible_purchase_reversal_cases reversal_case
        WHERE reversal_case.collision_at < ${fiscalCutoff}`
      if (recordIds) statement.append(sql` AND reversal_case.id = ANY(${[...recordIds]}::uuid[])`)
      else if (cursorId)
        statement.append(sql` AND (reversal_case.collision_at, reversal_case.id) > (
          SELECT after.collision_at, after.id FROM membership_ineligible_purchase_reversal_cases after
          WHERE after.id = ${cursorId}::uuid)`)
      statement.append(sql`
        ORDER BY reversal_case.collision_at, reversal_case.id
        LIMIT ${pageSize + 1}`)
      return (await query<{ id: string; due: boolean }>(statement)).rows
    },
    lockDue: async (query, dueId) => {
      const { rows } = await query<{ id: string }>(sql`/* lockExpiredMembershipReversalCase */
        SELECT reversal_case.id FROM membership_ineligible_purchase_reversal_cases reversal_case
        WHERE reversal_case.id = ${dueId} AND fn_membership_reversal_case_expired(reversal_case.id)
        FOR UPDATE OF reversal_case SKIP LOCKED`)
      return rows[0]?.id
    },
    drainChildren: (query, caseId) =>
      drainExpiredMembershipReversalCaseChildren(query, caseId, pageSize),
    deleteRoot: async (query, caseId) => {
      const result = await query(sql`/* deleteExpiredMembershipReversalCase */
        DELETE FROM membership_ineligible_purchase_reversal_cases reversal_case
        WHERE reversal_case.id = ${caseId} AND fn_membership_reversal_case_expired(reversal_case.id)
          AND NOT EXISTS (SELECT 1 FROM membership_ineligible_purchase_reversal_refund_scans scan
            WHERE scan.membership_ineligible_purchase_reversal_case_id = reversal_case.id)
          AND NOT EXISTS (SELECT 1 FROM membership_ineligible_purchase_reversal_refund_scan_cycles cycle
            WHERE cycle.membership_ineligible_purchase_reversal_case_id = reversal_case.id)`)
      return result.rowCount ?? 0
    },
  })
}
