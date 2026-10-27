import type { QueryExecutor } from '../types.mts'

/** A terminal reservation cannot resume; a live run still fences manual range retirement. */
export async function assertNoPendingClassifierWork(
  query: QueryExecutor,
  fromId: string,
  toId: string,
): Promise<void> {
  const batches = await query(
    `/* assertNoPendingClassifierWork:batches */
      SELECT 1 FROM classifier_decision_batches batch
      WHERE batch.id >= $1::uuid AND batch.id < $2::uuid AND batch.completed_at IS NULL
        AND EXISTS (
          SELECT 1 FROM classifier_runs run
          WHERE run.decision_batch_id = batch.id
            AND run.completed_at IS NULL AND run.superseded_at IS NULL
            AND run.terminal_failed_at IS NULL
        )
      LIMIT 1`,
    [fromId, toId],
  )
  if (batches.rows.length > 0) throw new Error('Classifier result range has incomplete batches')
  const runs = await query(
    `/* assertNoPendingClassifierWork:runs */
      SELECT 1 FROM classifier_runs
      WHERE decision_batch_id IS NOT NULL
        AND decision_batch_id >= $1::uuid AND decision_batch_id < $2::uuid
        AND completed_at IS NULL AND superseded_at IS NULL AND terminal_failed_at IS NULL
      LIMIT 1`,
    [fromId, toId],
  )
  if (runs.rows.length > 0) throw new Error('Classifier result range has pending runs')
  // Calls have no separate completion state. Batch completion fences every call in this range.
}
