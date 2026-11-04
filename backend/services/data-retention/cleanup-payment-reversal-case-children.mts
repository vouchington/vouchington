import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Delete one expired reversal case's joined rows in FK order, counting every physical row against the page. */
export async function drainExpiredMembershipReversalCaseChildren(
  query: TransactionQuery,
  caseId: string,
  pageSize: number,
): Promise<number> {
  let remaining = pageSize
  const observations = await query(sql`/* deleteExpiredMembershipReversalRefundObservations */
    WITH pending AS (
      SELECT observation.id FROM membership_ineligible_purchase_reversal_refund_scans scan
      JOIN membership_ineligible_purchase_reversal_refund_observations observation
        ON observation.membership_ineligible_purchase_reversal_refund_scan_id = scan.id
      WHERE scan.membership_ineligible_purchase_reversal_case_id = ${caseId}
      ORDER BY observation.id LIMIT ${remaining} FOR UPDATE OF observation
    ) DELETE FROM membership_ineligible_purchase_reversal_refund_observations observation
    USING pending WHERE observation.id = pending.id`)
  remaining -= observations.rowCount ?? 0
  if (remaining === 0) return pageSize

  const scans = await query(sql`/* deleteExpiredMembershipReversalRefundScans */
    WITH pending AS (
      SELECT scan.id FROM membership_ineligible_purchase_reversal_refund_scans scan
      WHERE scan.membership_ineligible_purchase_reversal_case_id = ${caseId}
        AND NOT EXISTS (SELECT 1 FROM membership_ineligible_purchase_reversal_refund_observations observation
          WHERE observation.membership_ineligible_purchase_reversal_refund_scan_id = scan.id)
      ORDER BY scan.id LIMIT ${remaining} FOR UPDATE OF scan
    ) DELETE FROM membership_ineligible_purchase_reversal_refund_scans scan
    USING pending WHERE scan.id = pending.id`)
  remaining -= scans.rowCount ?? 0
  if (remaining === 0) return pageSize

  const cycles = await query(sql`/* deleteExpiredMembershipReversalRefundScanCycle */
    DELETE FROM membership_ineligible_purchase_reversal_refund_scan_cycles cycle
    WHERE cycle.membership_ineligible_purchase_reversal_case_id = ${caseId}
      AND NOT EXISTS (SELECT 1 FROM membership_ineligible_purchase_reversal_refund_scans scan
        WHERE scan.membership_ineligible_purchase_reversal_case_id = ${caseId})`)
  return pageSize - remaining + (cycles.rowCount ?? 0)
}
