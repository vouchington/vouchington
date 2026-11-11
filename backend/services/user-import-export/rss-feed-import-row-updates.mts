import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import type { ImportRssFeedStatus } from './import-rss-feeds.mts'
import sql from 'sql-template-strings'

export async function updateRssFeedImportRowCompleted(
  rowId: string,
  outcome: Exclude<ImportRssFeedStatus, 'error'>,
  rssFeedId: string,
): Promise<void> {
  await withRssFeedImportRowWrite(async query => {
    // Each write names the one transition it applies, so the matched row decides the
    // batch delta and no pre-image of a row that changed while this statement waited is read.
    const pending = await query<{ batch_id: string }>(sql`/* updateRssFeedImportRowCompleted */
      UPDATE user_rss_feed_import_rows
      SET completed_at = CURRENT_TIMESTAMP,
          outcome = ${outcome},
          rss_feed_id = ${rssFeedId}::uuid,
          error_message = NULL
      WHERE id = ${rowId}
        AND completed_at IS NULL
        AND failed_at IS NULL
      RETURNING batch_id
    `)
    if (pending.rows[0]) {
      await applyRssFeedImportBatchDelta(query, pending.rows[0].batch_id, {
        completed: 1,
        failed: 0,
        skipped: 0,
      })
      return
    }
    const limited = await query<{ batch_id: string }>(
      sql`/* updateRssFeedImportRowCompleted/fromRelationLimit */
      UPDATE user_rss_feed_import_rows
      SET completed_at = CURRENT_TIMESTAMP,
          failed_at = NULL,
          outcome = ${outcome},
          rss_feed_id = ${rssFeedId}::uuid,
          error_message = NULL
      WHERE id = ${rowId}
        AND completed_at IS NULL
        AND failed_at IS NOT NULL
        AND error_message = 'RELATION_LIMIT_REACHED'
      RETURNING batch_id
    `,
    )
    if (!limited.rows[0]) return
    await applyRssFeedImportBatchDelta(query, limited.rows[0].batch_id, {
      completed: 1,
      failed: -1,
      skipped: -1,
    })
  })
}

export async function updateRssFeedImportRowFailed(
  rowId: string,
  errorMessage: string,
  options: { isFinalAttempt: boolean; rssFeedId?: string },
): Promise<void> {
  const trimmed = errorMessage.trim()
  if (!options.isFinalAttempt) {
    await write(
      sql`/* updateRssFeedImportRowFailed/intermediate */
        UPDATE user_rss_feed_import_rows
        SET error_message = ${trimmed}
        WHERE id = ${rowId}
          AND completed_at IS NULL
          AND failed_at IS NULL
      `,
    )
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
      completed: 0,
      failed: 1,
      skipped: trimmed === 'RELATION_LIMIT_REACHED' ? 1 : 0,
    })
  })
}

// The row write and its batch delta share a transaction. The batch statement starts after the
// row write, so its counters include any final failure or completion that committed meanwhile.
async function withRssFeedImportRowWrite(
  run: (query: TransactionQuery) => Promise<void>,
): Promise<void> {
  await using owned = await beginTransaction()
  await run(owned)
  await owned.commit()
}

async function applyRssFeedImportBatchDelta(
  query: TransactionQuery,
  batchId: string,
  delta: { completed: number; failed: number; skipped: number },
): Promise<void> {
  await query(sql`/* applyRssFeedImportBatchDelta */
    UPDATE user_rss_feed_import_batches
    SET completed_rows = completed_rows + ${delta.completed},
        failed_rows = failed_rows + ${delta.failed},
        skipped_rows = skipped_rows + ${delta.skipped},
        completed_at = CASE
          WHEN completed_rows + ${delta.completed} + failed_rows + ${delta.failed} = total_rows
            THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
          ELSE NULL
        END
    WHERE id = ${batchId}
  `)
}
