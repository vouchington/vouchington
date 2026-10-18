import { write } from '@data-stores/psql'
import assert from 'http-assert'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import sql from 'sql-template-strings'
import { getUserImportExportConfig } from './config.mts'
import {
  type UserRssFeedImport,
  type UserRssFeedImportBatchRow,
  type UserRssFeedImportRow,
  type UserRssFeedImportSummary,
  toImportRowResult,
  toImportSummary,
} from './rss-feed-import-types.mts'

type StatusRow = UserRssFeedImportBatchRow &
  Pick<UserRssFeedImportRow, 'input_url' | 'outcome' | 'error_message' | 'rss_feed_id'> & {
    row_id: string | null
    cursor_found: boolean | null
    topic_slug: string | null
  }

function importRowCursorScope(importId: string): string {
  return `rss-feed-import-rows:${importId}:row-index-asc`
}

/** The import's counters alone: one row, however large the import is. */
export async function getRssFeedImportSummary(
  currentUserId: string,
  importId: string,
): Promise<UserRssFeedImportSummary | null> {
  if (!isUUID(importId)) return null

  const { rows } = await write<UserRssFeedImportBatchRow>(
    sql`/* getRssFeedImportSummary */
      SELECT id, total_rows, completed_rows, failed_rows, completed_at, created_at
      FROM user_rss_feed_import_batches
      WHERE id = ${importId}
        AND user_id = ${currentUserId}
    `,
  )
  return rows[0] ? toImportSummary(rows[0]) : null
}

/**
 * The import's counters plus one keyset page of its rows, in input order. The page size is the
 * configured one; a smaller `limit` narrows it. `after` is the cursor of the previous page. One
 * statement reads both on the primary, so a just-created import is immediately pollable.
 */
export async function getRssFeedImport(
  currentUserId: string,
  importId: string,
  options: { limit?: number; after?: string } = {},
): Promise<UserRssFeedImport | null> {
  if (!isUUID(importId)) return null

  const pageSize = getUserImportExportConfig().import_status_page_size
  const limit = Math.min(options.limit ?? pageSize, pageSize)
  const scope = importRowCursorScope(importId)
  const afterRowId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid import cursor').id
    : null

  const query = sql`/* getRssFeedImport */
    SELECT batch.id, batch.total_rows, batch.completed_rows, batch.failed_rows,
      batch.completed_at, batch.created_at, page.id AS row_id, page.input_url, page.outcome,
      page.error_message, page.rss_feed_id, page.topic_slug,
      EXISTS (
        SELECT 1 FROM user_rss_feed_import_rows cursor_row
        WHERE cursor_row.id = ${afterRowId}::uuid
          AND cursor_row.batch_id = batch.id
      ) AS cursor_found
    FROM user_rss_feed_import_batches batch
    LEFT JOIN LATERAL (
      SELECT import_row.id, import_row.row_index, import_row.input_url, import_row.outcome,
        import_row.error_message, import_row.rss_feed_id, topic.slug AS topic_slug
      FROM user_rss_feed_import_rows import_row
      LEFT JOIN rss_feeds feed ON feed.id = import_row.rss_feed_id
      LEFT JOIN topics source_topic ON source_topic.id = feed.topic_id
        AND source_topic.deleted_at IS NULL
      LEFT JOIN topics topic ON topic.id = COALESCE(source_topic.merged_into_topic_id, source_topic.id)
        AND topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
      WHERE import_row.batch_id = batch.id`
  if (afterRowId) {
    query.append(sql`
        AND import_row.row_index > (
          SELECT cursor_row.row_index
          FROM user_rss_feed_import_rows cursor_row
          WHERE cursor_row.id = ${afterRowId}
            AND cursor_row.batch_id = batch.id
        )`)
  }
  query.append(sql`
      ORDER BY import_row.row_index
      LIMIT ${limit + 1}
    ) page ON TRUE
    WHERE batch.id = ${importId}
      AND batch.user_id = ${currentUserId}
    ORDER BY page.row_index`)
  const { rows } = await write<StatusRow>(query)
  const batch = rows[0]
  if (!batch) return null
  // A cursor must name a row of this import; otherwise the page would look like the end.
  assert(afterRowId === null || batch.cursor_found, 400, 'Invalid import cursor')

  const listed = rows.flatMap(row =>
    row.row_id === null ? [] : [toImportRowResult({ ...row, id: row.row_id })],
  )
  const results = listed.slice(0, limit)
  return {
    import: toImportSummary(batch),
    rows: results,
    page_info: buildPageInfo(results, {
      hasNextPage: listed.length > limit,
      getCursor: row => ({ id: row.id, scope }),
    }),
  }
}
