import type { BasicUser } from '../services/users/types.mts'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createRssFeedImport } from '../services/user-import-export/rss-feed-import-records.mts'

/**
 * Commits an import batch without enqueuing its dispatcher, so a test drives the rows itself.
 * URLs are stored as given; deduplication and validation belong to the public submit.
 */
export function createRssFeedImportBatchForTest(
  currentUser: BasicUser,
  provenance: ContentProvenance,
  urls: string[],
  options: { should_follow_imported_feeds?: boolean } = {},
) {
  return createRssFeedImport(
    currentUser.id,
    provenance,
    urls,
    options.should_follow_imported_feeds !== false,
  )
}

/** A recently stale recovery fixture that stays outside the worker's default cutoff. */
export async function createStaleRssFeedImportBatchForTest(
  userId: string,
  inputUrls: string[],
  terminalError = false,
): Promise<string> {
  const { rows } = await write<{ batch_id: string }>(sql`/* createStaleRssFeedImportBatchForTest */
    WITH import_batch AS (
      INSERT INTO user_rss_feed_import_batches (user_id, created_via, total_rows, updated_at)
      VALUES (${userId}, 'web', ${inputUrls.length}, CURRENT_TIMESTAMP - INTERVAL '2 seconds')
      RETURNING id
    )
    INSERT INTO user_rss_feed_import_rows
      (batch_id, row_index, input_url, outcome, failed_at, error_message)
    SELECT import_batch.id, input.row_index, input.input_url,
      CASE WHEN ${terminalError} THEN 'error'::user_rss_feed_import_row_outcomes END,
      CASE WHEN ${terminalError} THEN CURRENT_TIMESTAMP END,
      CASE WHEN ${terminalError} THEN 'RELATION_LIMIT_REACHED' END
    FROM import_batch
    CROSS JOIN UNNEST(
      ${inputUrls.map((_, index) => index)}::int[],
      ${inputUrls}::text[]
    ) AS input(row_index, input_url)
    RETURNING batch_id
  `)
  return rows[0]!.batch_id
}

export async function deleteStaleRssFeedImportBatchForTest(
  userId: string,
  batchId: string,
): Promise<void> {
  await write(sql`/* deleteStaleRssFeedImportBatchForTest */
    DELETE FROM user_rss_feed_import_batches
    WHERE id = ${batchId} AND user_id = ${userId}
  `)
}
