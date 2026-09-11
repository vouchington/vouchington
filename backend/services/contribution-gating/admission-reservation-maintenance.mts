import { beginTransaction } from '@data-stores/psql'
import { serializeContributionAdmissionFailure } from './admission-errors.mts'
import sql from 'sql-template-strings'

export async function pruneExpiredContributionAdmissions(
  now?: Date,
  batchSize = 100,
  lowerBoundDate?: Date,
): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('batchSize must be positive')
  await using transaction = await beginTransaction()
  const result = await transaction(sql`/* pruneExpiredContributionAdmissions */
    WITH expired AS (
      SELECT r.id FROM post_admission_reservations r
      WHERE r.retention_expires_at <= COALESCE(${now ?? null}::timestamptz, NOW())
        AND NOT EXISTS (
          SELECT 1 FROM post_admission_claims c
          WHERE c.reservation_id = r.id
            AND c.expires_at > COALESCE(${now ?? null}::timestamptz, NOW())
        )
        AND (${lowerBoundDate ?? null}::timestamptz IS NULL
          OR r.retention_expires_at >= ${lowerBoundDate ?? null}::timestamptz)
      ORDER BY r.retention_expires_at, r.id
      LIMIT ${batchSize}
      FOR UPDATE OF r SKIP LOCKED
    )
    DELETE FROM post_admission_reservations
    WHERE id IN (SELECT id FROM expired)`)
  await transaction.commit()
  return result.rowCount ?? 0
}

export async function markContributionAdmissionRetryableFailure(
  reservationId: string,
  leaseId: string,
  error: unknown,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* markContributionAdmissionRetryableFailure.update */
    UPDATE post_admission_reservations SET state = 'retryable_failed', retryable_failure = ${JSON.stringify(serializeContributionAdmissionFailure(error))}::jsonb,
      updated_at = NOW(), retention_expires_at = NOW() + INTERVAL '48 hours'
      WHERE id = ${reservationId} AND EXISTS (
        SELECT 1 FROM post_admission_claims WHERE reservation_id = ${reservationId} AND lease_id = ${leaseId}
      )`)
  await transaction(sql`/* markContributionAdmissionRetryableFailure.release */
    DELETE FROM post_admission_claims WHERE reservation_id = ${reservationId} AND lease_id = ${leaseId}`)
  await transaction.commit()
}

export async function discardRejectedContributionAdmission(
  reservationId: string,
  leaseId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* discardRejectedContributionAdmission */
    DELETE FROM post_admission_reservations
    WHERE id = ${reservationId} AND EXISTS (
      SELECT 1 FROM post_admission_claims
      WHERE reservation_id = ${reservationId} AND lease_id = ${leaseId}
    )`)
  await transaction.commit()
}
