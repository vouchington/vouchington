import { write } from '@data-stores/psql'
import type { ImportRssFeedStatus } from './import-rss-feeds.mts'
import sql from 'sql-template-strings'

export async function recordRssFeedImportCanonicalUrl(
  rowId: string,
  canonicalUrl: string,
): Promise<void> {
  await write(
    sql`/* recordRssFeedImportCanonicalUrl */
      UPDATE user_rss_feed_import_rows
      SET canonical_url = ${canonicalUrl}
      WHERE id = ${rowId}
        AND canonical_url IS NULL
    `,
  )
}

export async function updateRssFeedImportRowCompleted(
  rowId: string,
  outcome: Exclude<ImportRssFeedStatus, 'error'>,
  rssFeedId: string,
): Promise<void> {
  await write(
    sql`/* updateRssFeedImportRowCompleted */
      WITH prev AS (
        SELECT (failed_at IS NOT NULL)::int AS was_failed
        FROM user_rss_feed_import_rows
        WHERE id = ${rowId}
      ), updated_row AS (
        UPDATE user_rss_feed_import_rows
        SET completed_at = CURRENT_TIMESTAMP,
            failed_at = NULL,
            outcome = ${outcome},
            rss_feed_id = ${rssFeedId}::uuid,
            error_message = NULL
        WHERE id = ${rowId}
          AND completed_at IS NULL
          AND failed_at IS NULL
        RETURNING batch_id
      )
      UPDATE user_rss_feed_import_batches
      SET completed_rows = completed_rows + 1,
          failed_rows = failed_rows - (SELECT was_failed FROM prev),
          completed_at = CASE
            WHEN completed_at IS NOT NULL THEN completed_at
            WHEN completed_rows + 1 + failed_rows - (SELECT was_failed FROM prev) >= total_rows
              THEN CURRENT_TIMESTAMP
            ELSE NULL
          END
      FROM updated_row
      WHERE user_rss_feed_import_batches.id = updated_row.batch_id
    `,
  )
}

export async function updateRssFeedImportRowFailed(
  rowId: string,
  errorMessage: string,
  options: { isFinalAttempt: boolean },
): Promise<void> {
  if (!options.isFinalAttempt) {
    await write(
      sql`/* updateRssFeedImportRowFailed/intermediate */
        UPDATE user_rss_feed_import_rows
        SET error_message = ${errorMessage.trim()}
        WHERE id = ${rowId}
          AND completed_at IS NULL
          AND failed_at IS NULL
      `,
    )
    return
  }

  await write(
    sql`/* updateRssFeedImportRowFailed */
      WITH prev AS (
        SELECT (failed_at IS NOT NULL)::int AS was_failed
        FROM user_rss_feed_import_rows
        WHERE id = ${rowId}
      ), updated_row AS (
        UPDATE user_rss_feed_import_rows
        SET failed_at = COALESCE(failed_at, CURRENT_TIMESTAMP),
            outcome = 'error',
            error_message = ${errorMessage.trim()}
        WHERE id = ${rowId}
          AND completed_at IS NULL
          AND failed_at IS NULL
        RETURNING batch_id
      )
      UPDATE user_rss_feed_import_batches
      SET failed_rows = failed_rows + 1 - (SELECT was_failed FROM prev),
          completed_at = CASE
            WHEN completed_at IS NOT NULL THEN completed_at
            WHEN completed_rows + failed_rows + 1 - (SELECT was_failed FROM prev) >= total_rows
              THEN CURRENT_TIMESTAMP
            ELSE NULL
          END
      FROM updated_row
      WHERE user_rss_feed_import_batches.id = updated_row.batch_id
    `,
  )
}
