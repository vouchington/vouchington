import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type RowUpdateProgress = {
  batchId: string
  completed: number
  failed: number
  total: number
  done: boolean
}

type BatchRow = {
  batch_id: string
  completed_rows: number
  failed_rows: number
  total_rows: number
  completed_at: Date | null
}

function toProgress(row: BatchRow | undefined): RowUpdateProgress {
  if (!row) {
    return { batchId: '', completed: 0, failed: 0, total: 0, done: false }
  }
  return {
    batchId: row.batch_id,
    completed: Number(row.completed_rows),
    failed: Number(row.failed_rows),
    total: Number(row.total_rows),
    done: row.completed_at !== null,
  }
}

export async function updateRowCompleted(
  rowId: string,
  createdEntityId: string,
): Promise<RowUpdateProgress> {
  const { rows } = await write(
    sql`/* updateRowCompleted */
    WITH updated_row AS (
      UPDATE admin_import_rows row_definition
      SET completed_at = CURRENT_TIMESTAMP,
          topic_id = CASE
            WHEN batch.import_type = 'topic' THEN ${createdEntityId}::uuid
            ELSE NULL
          END,
          rss_feed_id = CASE
            WHEN batch.import_type = 'rss_feed' THEN ${createdEntityId}::uuid
            ELSE NULL
          END,
          error_message = NULL
      FROM admin_import_batches batch
      WHERE row_definition.id = ${rowId}
        AND batch.id = row_definition.batch_id
        AND row_definition.completed_at IS NULL
        AND row_definition.failed_at IS NULL
      RETURNING row_definition.batch_id
    ), updated_batch AS (
      UPDATE admin_import_batches
      SET
        completed_rows = completed_rows + 1,
        completed_at = CASE
          WHEN completed_at IS NOT NULL THEN completed_at
          WHEN completed_rows + 1 + failed_rows >= total_rows
            THEN CURRENT_TIMESTAMP
          ELSE NULL
        END
      FROM updated_row
      WHERE admin_import_batches.id = updated_row.batch_id
      RETURNING
        admin_import_batches.id AS batch_id,
        admin_import_batches.completed_rows,
        admin_import_batches.failed_rows,
        admin_import_batches.total_rows,
        admin_import_batches.completed_at
    )
    SELECT * FROM updated_batch
  `,
  )

  return toProgress(rows[0] as BatchRow | undefined)
}

// Intermediate failure: record the error but keep the row pending so glide-mq retries
// can still succeed without prematurely incrementing failed_rows or setting completed_at.
async function recordIntermediateFailure(rowId: string, errorMessage: string): Promise<void> {
  await write(
    sql`/* updateRowFailed/intermediate */
    UPDATE admin_import_rows
    SET error_message = ${errorMessage.trim()}
    WHERE id = ${rowId}
      AND completed_at IS NULL
      AND failed_at IS NULL
  `,
  )
}

export async function updateRowFailed(
  rowId: string,
  errorMessage: string,
  options?: { isFinalAttempt?: boolean },
): Promise<RowUpdateProgress | null> {
  if (options?.isFinalAttempt === false) {
    await recordIntermediateFailure(rowId, errorMessage)
    return null
  }

  const { rows } = await write(
    sql`/* updateRowFailed */
    WITH prev AS (
      SELECT (failed_at IS NOT NULL)::int AS was_failed
      FROM admin_import_rows
      WHERE id = ${rowId}
    ), updated_row AS (
      UPDATE admin_import_rows
      SET failed_at = COALESCE(failed_at, CURRENT_TIMESTAMP),
          error_message = ${errorMessage.trim()}
      WHERE id = ${rowId}
        AND completed_at IS NULL
      RETURNING batch_id
    ), updated_batch AS (
      UPDATE admin_import_batches
      SET
        failed_rows = failed_rows + 1 - (SELECT was_failed FROM prev),
        completed_at = CASE
          WHEN completed_at IS NOT NULL THEN completed_at
          WHEN completed_rows + failed_rows + 1 - (SELECT was_failed FROM prev) >= total_rows
            THEN CURRENT_TIMESTAMP
          ELSE NULL
        END
      FROM updated_row
      WHERE admin_import_batches.id = updated_row.batch_id
      RETURNING
        admin_import_batches.id AS batch_id,
        admin_import_batches.completed_rows,
        admin_import_batches.failed_rows,
        admin_import_batches.total_rows,
        admin_import_batches.completed_at
    )
    SELECT * FROM updated_batch
  `,
  )

  return toProgress(rows[0] as BatchRow | undefined)
}
