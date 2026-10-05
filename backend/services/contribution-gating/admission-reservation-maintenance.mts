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
            AND c.lease_expires_at > COALESCE(${now ?? null}::timestamptz, NOW())
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
  leaseToken: string,
  error: unknown,
): Promise<void> {
  await using transaction = await beginTransaction()
  const { rowCount } = await transaction(sql`/* markContributionAdmissionRetryableFailure.update */
    INSERT INTO post_admission_attempt_results (post_admission_attempt_id, failed_at, failure)
    SELECT attempt.id, clock_timestamp(), ${JSON.stringify(serializeContributionAdmissionFailure(error))}::jsonb
    FROM post_admission_attempts attempt JOIN post_admission_claims claim
      ON claim.reservation_id = attempt.reservation_id AND claim.lease_token = attempt.lease_token
    WHERE claim.reservation_id = ${reservationId} AND claim.lease_token = ${leaseToken}
      AND claim.lease_expires_at > clock_timestamp()
    ON CONFLICT (post_admission_attempt_id) DO NOTHING`)
  if (rowCount !== 1) {
    await transaction.commit()
    return
  }
  await transaction(sql`/* markContributionAdmissionRetryableFailure.extendRetention */
    UPDATE post_admission_reservations
    SET retention_expires_at = clock_timestamp() + INTERVAL '48 hours'
    WHERE id = ${reservationId} AND EXISTS (
      SELECT 1 FROM post_admission_claims
      WHERE reservation_id = ${reservationId} AND lease_token = ${leaseToken}
        AND lease_expires_at > clock_timestamp()
    )`)
  await transaction(sql`/* markContributionAdmissionRetryableFailure.release */
    DELETE FROM post_admission_claims WHERE reservation_id = ${reservationId} AND lease_token = ${leaseToken}`)
  await transaction.commit()
}

export async function discardRejectedContributionAdmission(
  reservationId: string,
  leaseToken: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* discardRejectedContributionAdmission */
    DELETE FROM post_admission_reservations
    WHERE id = ${reservationId} AND EXISTS (
      SELECT 1 FROM post_admission_claims
      WHERE reservation_id = ${reservationId} AND lease_token = ${leaseToken}
        AND lease_expires_at > clock_timestamp()
    )`)
  await transaction.commit()
}
