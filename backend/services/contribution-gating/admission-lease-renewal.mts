import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { CONTRIBUTION_ADMISSION_CLAIM_SECONDS } from './config.mts'

export async function renewContributionAdmissionLease(
  query: QueryExecutor,
  reservationId: string,
  leaseToken: string,
): Promise<Date | null> {
  const result = await query<{ committed_at: Date }>(sql`/* renewContributionAdmissionLease */
    WITH observed_at AS (SELECT clock_timestamp() AS value)
    UPDATE post_admission_claims c
    SET lease_expires_at = observed_at.value + ${CONTRIBUTION_ADMISSION_CLAIM_SECONDS} * INTERVAL '1 second'
    FROM observed_at
    WHERE c.reservation_id = ${reservationId} AND c.lease_token = ${leaseToken}
      AND c.lease_expires_at > observed_at.value
    RETURNING observed_at.value AS committed_at`)
  return result.rows[0]?.committed_at ?? null
}
