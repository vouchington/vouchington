import type { OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Expired decisions may finish only a previously reserved, still leased run. */
export async function assertRetainedActiveDecisionReservation(
  query: OwnedTransaction,
  runId: string,
  batchId: string,
): Promise<void> {
  const { rows } = await query<{ id: string }>(sql`
    /* assertRetainedActiveDecisionReservation */
    SELECT batch.id FROM classifier_decision_batches batch
    JOIN classifier_runs run ON run.decision_batch_id = batch.id
    WHERE batch.id = ${batchId} AND run.id = ${runId}
      AND run.outcomes_persisted_at IS NULL
      AND run.completed_at IS NULL AND run.superseded_at IS NULL
      AND run.terminal_failed_at IS NULL
      AND run.lease_token IS NOT NULL AND run.lease_expires_at > clock_timestamp()
    FOR SHARE OF batch, run
  `)
  if (!rows[0]) throw new RangeError('Classifier decision batch is outside the retention window')
}
