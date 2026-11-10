import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import type { ImportRssFeedStatus } from './import-rss-feeds.mts'
import sql from 'sql-template-strings'

export async function updateRssFeedImportRowCompleted(
  rowId: string,
  outcome: Exclude<ImportRssFeedStatus, 'error'>,
  rssFeedId: string,
): Promise<void> {
  await withRssFeedImportRowWrite(async query => {
    const { rows } = await query<{
      batch_id: string
      was_failed: number
      previous_error_message: string | null
    }>(sql`/* updateRssFeedImportRowCompleted */
      UPDATE user_rss_feed_import_rows
      SET completed_at = CURRENT_TIMESTAMP,
          failed_at = NULL,
          outcome = ${outcome},
          rss_feed_id = ${rssFeedId}::uuid,
          error_message = NULL
      WHERE id = ${rowId}
        AND completed_at IS NULL
        AND (failed_at IS NULL OR error_message = 'RELATION_LIMIT_REACHED')
      RETURNING batch_id,
        (old.failed_at IS NOT NULL)::int AS was_failed,
        old.error_message AS previous_error_message
    `)
    const updated = rows[0]
    if (!updated) return
    const failedDelta = -updated.was_failed
    const skippedDelta =
      updated.was_failed === 1 && updated.previous_error_message === 'RELATION_LIMIT_REACHED'
        ? -1
        : 0
    await applyRssFeedImportBatchDelta(query, updated.batch_id, {
      completedDelta: 1,
      failedDelta,
      skippedDelta,
      marker: 'updateRssFeedImportRowCompletedBatch',
    })
  })
}

export async function updateRssFeedImportRowFailed(
  rowId: string,
  errorMessage: string,
  options: { isFinalAttempt: boolean; rssFeedId?: string; query?: TransactionQuery },
): Promise<void> {
  const trimmed = errorMessage.trim()
  if (!options.isFinalAttempt) {
    const statement = sql`/* updateRssFeedImportRowFailed/intermediate */
      UPDATE user_rss_feed_import_rows
      SET error_message = ${trimmed}
      WHERE id = ${rowId}
        AND completed_at IS NULL
        AND failed_at IS NULL
    `
    if (options.query) await write(statement, { query: options.query })
    else await write(statement)
    return
  }

  await withRssFeedImportRowWrite(async query => {
    const { rows } = await query<{ batch_id: string }>(sql`/* updateRssFeedImportRowFailed */
      UPDATE user_rss_feed_import_rows
      SET failed_at = COALESCE(failed_at, CURRENT_TIMESTAMP),
          outcome = 'error',
          rss_feed_id = COALESCE(${options.rssFeedId ?? null}::uuid, rss_feed_id),
          error_message = ${trimmed}
      WHERE id = ${rowId}
        AND completed_at IS NULL
        AND failed_at IS NULL
      RETURNING batch_id
    `)
    const updated = rows[0]
    if (!updated) return
    await applyRssFeedImportBatchDelta(query, updated.batch_id, {
      completedDelta: 0,
      failedDelta: 1,
      skippedDelta: trimmed === 'RELATION_LIMIT_REACHED' ? 1 : 0,
      marker: 'updateRssFeedImportRowFailedBatch',
    })
  }, options.query)
}

// The batch statement starts after the row update waits, so its counters include a
// final failure or completion that committed while this row lock was held. Folding
// both into one statement applies that delta to the earlier batch snapshot.
async function withRssFeedImportRowWrite(
  run: (query: TransactionQuery) => Promise<void>,
  query?: TransactionQuery,
): Promise<void> {
  if (query) {
    await run(query)
    return
  }
  await using owned = await beginTransaction()
  await run(owned)
  await owned.commit()
}

async function applyRssFeedImportBatchDelta(
  query: TransactionQuery,
  batchId: string,
  delta: {
    completedDelta: number
    failedDelta: number
    skippedDelta: number
    marker: 'updateRssFeedImportRowCompletedBatch' | 'updateRssFeedImportRowFailedBatch'
  },
): Promise<void> {
  if (delta.marker === 'updateRssFeedImportRowCompletedBatch') {
    await query(sql`/* updateRssFeedImportRowCompletedBatch */
      UPDATE user_rss_feed_import_batches
      SET completed_rows = completed_rows + ${delta.completedDelta},
          failed_rows = failed_rows + ${delta.failedDelta},
          skipped_rows = skipped_rows + ${delta.skippedDelta},
          completed_at = CASE
            WHEN completed_rows + ${delta.completedDelta} + failed_rows + ${delta.failedDelta}
              = total_rows
              THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
            ELSE NULL
          END
      WHERE id = ${batchId}
    `)
    return
  }
  await query(sql`/* updateRssFeedImportRowFailedBatch */
    UPDATE user_rss_feed_import_batches
    SET completed_rows = completed_rows + ${delta.completedDelta},
        failed_rows = failed_rows + ${delta.failedDelta},
        skipped_rows = skipped_rows + ${delta.skippedDelta},
        completed_at = CASE
          WHEN completed_rows + ${delta.completedDelta} + failed_rows + ${delta.failedDelta}
            = total_rows
            THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
          ELSE NULL
        END
    WHERE id = ${batchId}
  `)
}
