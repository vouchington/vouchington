import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { drainExpiredMembershipReversalCaseChildren } from './cleanup-payment-reversal-case-children.mts'
import {
  lockPaymentCleanupCursor,
  savePaymentCleanupCursor,
} from './cleanup-payment-operations.mts'

/**
 * Reads one page of reversal cases in (collision_at, id) order, so a run touches at most
 * pageSize + 1 rows of the index. Whether a case is expired depends on other tables (closed state,
 * remaining operations), so the first expired case of the page is drained and a persisted cursor
 * steps past blocked cases. A completed pass resets the cursor. Scoped runs pick exact ids.
 */
export async function cleanupMembershipReversalCasePage(
  pageSize: number,
  fiscalCutoff: Date,
  recordIds?: readonly string[],
) {
  await using query = await beginTransaction()
  await query(
    sql`/* permitExpiredMembershipReversalCaseDelete */ SET LOCAL app.billing_retention_delete = 'on'`,
  )
  const cursorId = recordIds
    ? null
    : await lockPaymentCleanupCursor(query, 'membership_reversal_case_ledger')
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
  const { rows } = await query<{ id: string; due: boolean }>(statement)
  const page = rows.slice(0, pageSize)
  const dueIndex = page.findIndex(row => row.due)
  const dueId = dueIndex < 0 ? undefined : page[dueIndex]!.id
  const { rows: locked } = dueId
    ? await query<{ id: string }>(sql`/* lockExpiredMembershipReversalCase */
        SELECT reversal_case.id FROM membership_ineligible_purchase_reversal_cases reversal_case
        WHERE reversal_case.id = ${dueId} AND fn_membership_reversal_case_expired(reversal_case.id)
        FOR UPDATE OF reversal_case SKIP LOCKED`)
    : { rows: [] }
  const caseId = locked[0]?.id
  let deleted = 0
  let rootDeleted = 0
  if (caseId) {
    deleted = await drainExpiredMembershipReversalCaseChildren(query, caseId, pageSize)
    if (deleted < pageSize) {
      const result = await query(sql`/* deleteExpiredMembershipReversalCase */
        DELETE FROM membership_ineligible_purchase_reversal_cases reversal_case
        WHERE reversal_case.id = ${caseId} AND fn_membership_reversal_case_expired(reversal_case.id)
          AND NOT EXISTS (SELECT 1 FROM membership_ineligible_purchase_reversal_refund_scans scan
            WHERE scan.membership_ineligible_purchase_reversal_case_id = reversal_case.id)
          AND NOT EXISTS (SELECT 1 FROM membership_ineligible_purchase_reversal_refund_scan_cycles cycle
            WHERE cycle.membership_ineligible_purchase_reversal_case_id = reversal_case.id)`)
      rootDeleted = result.rowCount ?? 0
      deleted += rootDeleted
    }
  }
  // The drained case is revisited until it is gone, so the cursor never moves onto or past it.
  const hasMore = caseId ? rootDeleted === 0 || rows.length > dueIndex + 1 : rows.length > pageSize
  if (!recordIds)
    await savePaymentCleanupCursor(
      query,
      'membership_reversal_case_ledger',
      hasMore ? (page[(caseId ? dueIndex : page.length) - 1]?.id ?? cursorId) : null,
    )
  await query.commit()
  return { scanned: page.length, deleted, hasMore }
}
