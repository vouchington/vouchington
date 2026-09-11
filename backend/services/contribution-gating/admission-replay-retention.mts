import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const CONTRIBUTION_ADMISSION_REPLAY_RETENTION_MINUTES = 48 * 60 + 5

/** Extends exact committed replays from the database clock while their row lock is held. */
export async function extendContributionAdmissionReplay(
  query: TransactionQuery,
  reservationId: string,
): Promise<void> {
  await query(sql`/* extendContributionAdmissionReplay */
    WITH replay_deadline AS (
      SELECT clock_timestamp() AS now
    )
    UPDATE post_admission_reservations
    SET expires_at = GREATEST(expires_at, retention_expires_at,
        replay_deadline.now + ${CONTRIBUTION_ADMISSION_REPLAY_RETENTION_MINUTES} * INTERVAL '1 minute'),
      retention_expires_at = GREATEST(expires_at, retention_expires_at,
        replay_deadline.now + ${CONTRIBUTION_ADMISSION_REPLAY_RETENTION_MINUTES} * INTERVAL '1 minute'),
      updated_at = replay_deadline.now
    FROM replay_deadline
    WHERE id = ${reservationId} AND state = 'committed'`)
}

/** Completes a markerless replay, rolls its horizon, and releases its stale claim atomically. */
export async function completeMarkerlessContributionAdmissionReplay(
  query: TransactionQuery,
  reservationId: string,
): Promise<void> {
  await query(sql`/* completeMarkerlessContributionAdmissionReplay */
    WITH replay_deadline AS (
      SELECT clock_timestamp() AS now
    ), completed AS (
      UPDATE post_admission_reservations
      SET replay_metadata = replay_metadata || '{"finalization":"complete"}'::jsonb,
        expires_at = GREATEST(expires_at, retention_expires_at,
          replay_deadline.now + ${CONTRIBUTION_ADMISSION_REPLAY_RETENTION_MINUTES} * INTERVAL '1 minute'),
        retention_expires_at = GREATEST(expires_at, retention_expires_at,
          replay_deadline.now + ${CONTRIBUTION_ADMISSION_REPLAY_RETENTION_MINUTES} * INTERVAL '1 minute'),
        updated_at = replay_deadline.now
      FROM replay_deadline
      WHERE id = ${reservationId} AND state = 'committed'
      RETURNING id
    )
    DELETE FROM post_admission_claims
    USING completed
    WHERE post_admission_claims.reservation_id = completed.id`)
}
