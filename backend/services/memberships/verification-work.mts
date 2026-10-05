import { write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getMembershipWorkLimit } from './work-limits.mts'

export async function finalizeClaimedMembershipVerification(
  query: QueryExecutor,
  id: string,
  leaseToken: string,
  disposition: 'verified' | 'conflict' | 'rejected',
  reason: string,
): Promise<boolean> {
  const { rowCount } = await query(sql`/* finalizeClaimedMembershipVerification */
    WITH completed AS (
      UPDATE membership_verification_processing_work_items
      SET completed_at = clock_timestamp(), lease_token = NULL, leased_at = NULL,
        lease_expires_at = NULL, last_error = NULL
      WHERE membership_verification_id = ${id} AND lease_token = ${leaseToken}
        AND lease_expires_at > clock_timestamp() AND completed_at IS NULL
      RETURNING membership_verification_id
    ) UPDATE membership_verifications verification
      SET verified_at = CASE WHEN ${disposition} = 'verified' THEN clock_timestamp() ELSE NULL END,
          conflicted_at = CASE WHEN ${disposition} = 'conflict' THEN clock_timestamp() ELSE NULL END,
          rejected_at = CASE WHEN ${disposition} = 'rejected' THEN clock_timestamp() ELSE NULL END,
          result_code = ${reason}::membership_verification_result_codes
      FROM completed WHERE verification.id = completed.membership_verification_id
        AND verification.verified_at IS NULL AND verification.conflicted_at IS NULL
        AND verification.rejected_at IS NULL
  `)
  return rowCount === 1
}

export async function deferClaimedMembershipVerification(
  id: string,
  leaseToken: string,
  message: string,
  query: QueryExecutor = write,
): Promise<boolean> {
  const delay = getMembershipWorkLimit('verification_retry_minutes')
  const { rowCount } = await query(sql`/* deferClaimedMembershipVerification */
    UPDATE membership_verification_processing_work_items
    SET lease_token = NULL, leased_at = NULL, lease_expires_at = NULL,
      available_at = clock_timestamp() + ${delay}::integer * INTERVAL '1 minute',
      last_error = ${message.slice(0, 1000)}
    WHERE membership_verification_id = ${id} AND lease_token = ${leaseToken}
      AND lease_expires_at > clock_timestamp() AND completed_at IS NULL
  `)
  return rowCount === 1
}
