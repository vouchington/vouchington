import { write } from '@data-stores/psql'
import type { ImportRssFeedStatus } from './import-rss-feeds.mts'
import sql from 'sql-template-strings'

export async function updateRssFeedImportRowCompleted(
  rowId: string,
  outcome: Exclude<ImportRssFeedStatus, 'error'>,
  rssFeedId: string,
): Promise<void> {
  const pending = await write(sql`/* updateRssFeedImportRowCompleted */
      UPDATE user_rss_feed_import_rows
      SET completed_at = CURRENT_TIMESTAMP,
          outcome = ${outcome},
          rss_feed_id = ${rssFeedId}::uuid,
          error_message = NULL
      WHERE id = ${rowId}
        AND completed_at IS NULL
        AND failed_at IS NULL
    `)
  if (pending.rowCount === 0)
    await write(
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
    `,
    )
  await completeRssFeedImportBatch(rowId)
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

  await write(sql`/* updateRssFeedImportRowFailed */
      UPDATE user_rss_feed_import_rows
      SET failed_at = COALESCE(failed_at, CURRENT_TIMESTAMP),
          outcome = 'error',
          rss_feed_id = COALESCE(${options.rssFeedId ?? null}::uuid, rss_feed_id),
          error_message = ${trimmed}
      WHERE id = ${rowId}
        AND completed_at IS NULL
        AND failed_at IS NULL
    `)
  await completeRssFeedImportBatch(rowId)
}

// Row transitions commit first. The last committer can see every preceding terminal row,
// including when two distinct final rows finish concurrently. Replays also reconcile completion.
async function completeRssFeedImportBatch(rowId: string): Promise<void> {
  await write(sql`/* completeRssFeedImportBatch */
    UPDATE user_rss_feed_import_batches
    SET completed_at = CURRENT_TIMESTAMP
    WHERE id = (SELECT batch_id FROM user_rss_feed_import_rows WHERE id = ${rowId})
      AND completed_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_rss_feed_import_rows pending
        WHERE pending.batch_id = user_rss_feed_import_batches.id
          AND pending.outcome IS NULL
      )
  `)
}
