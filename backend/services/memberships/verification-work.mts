import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Only a still-pending verification can commit a provider outcome and its projections. */
export async function finalizePendingMembershipVerification(
  query: QueryExecutor,
  id: string,
  disposition: 'verified' | 'conflict' | 'rejected',
  reason: string,
): Promise<boolean> {
  const { rowCount } = await query(sql`/* finalizePendingMembershipVerification */
    UPDATE membership_verifications
    SET verified_at = CASE WHEN ${disposition} = 'verified' THEN clock_timestamp() ELSE NULL END,
        conflicted_at = CASE WHEN ${disposition} = 'conflict' THEN clock_timestamp() ELSE NULL END,
        rejected_at = CASE WHEN ${disposition} = 'rejected' THEN clock_timestamp() ELSE NULL END,
        result_code = ${reason}::membership_verification_result_codes
    WHERE id = ${id} AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL
  `)
  return rowCount === 1
}
