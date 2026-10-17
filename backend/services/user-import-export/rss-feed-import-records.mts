import { read, beginTransaction, write } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import sql from 'sql-template-strings'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import { getUserImportExportConfig } from './config.mts'
import {
  type CreateUserRssFeedImportResult,
  type UserRssFeedImport,
  type UserRssFeedImportBatchRow,
  type UserRssFeedImportRow,
  type UserRssFeedImportSummary,
  toImportRowResult,
  toImportSummary,
} from './rss-feed-import-types.mts'

type ImportReadRow = Pick<
  UserRssFeedImportRow,
  'id' | 'input_url' | 'outcome' | 'error_message' | 'rss_feed_id'
>

export async function createRssFeedImport(
  userId: string,
  provenance: ContentProvenance,
  urls: string[],
  should_follow_imported_feeds: boolean,
): Promise<CreateUserRssFeedImportResult> {
  const chunkSize = getUserImportExportConfig().import_insert_chunk_size
  await using query = await beginTransaction()
  const { rows } = await write(
    sql`/* createRssFeedImport */
      INSERT INTO user_rss_feed_import_batches (
        user_id,
        created_via,
        created_via_oauth_client_id,
        should_follow_imported_feeds,
        total_rows
      )
      VALUES (
        ${userId},
        ${provenance.createdVia},
        ${provenance.oauthClientId},
        ${should_follow_imported_feeds},
        ${urls.length}
      )
      RETURNING id, total_rows, completed_rows, failed_rows, completed_at, created_at
      `,
    { query },
  )
  const batch = rows[0] as UserRssFeedImportBatchRow

  // Bounded chunks keep one statement from carrying every URL of a large import.
  for (let start = 0; start < urls.length; start += chunkSize) {
    const chunk = urls.slice(start, start + chunkSize)
    // oxlint-disable-next-line no-await-in-loop -- chunks of one transaction insert in row order
    await write(
      sql`/* createRssFeedImportRows */
        INSERT INTO user_rss_feed_import_rows (batch_id, row_index, input_url)
        SELECT ${batch.id}, input.row_index, input.input_url
        FROM UNNEST(
          ${chunk.map((_, offset) => start + offset)}::int[],
          ${chunk}::text[]
        ) AS input(row_index, input_url)
        `,
      { query },
    )
  }

  await query.commit()
  return { import: toImportSummary(batch) }
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

  const { rows } = await read<UserRssFeedImportBatchRow>(
    sql`/* getRssFeedImport */
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
 * configured one; a smaller `limit` narrows it. `after` is the cursor of the previous page.
 */
export async function getRssFeedImport(
  currentUserId: string,
  importId: string,
  options: { limit?: number; after?: string } = {},
): Promise<UserRssFeedImport | null> {
  const summary = await getRssFeedImportSummary(currentUserId, importId)
  if (!summary) return null

  const pageSize = getUserImportExportConfig().import_status_page_size
  const limit = Math.min(options.limit ?? pageSize, pageSize)
  const scope = importRowCursorScope(importId)
  const afterRowId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid import cursor').id
    : null

  const query = sql`/* getRssFeedImportRows */
    SELECT id, input_url, outcome, error_message, rss_feed_id
    FROM user_rss_feed_import_rows
    WHERE batch_id = ${importId}`
  if (afterRowId) {
    query.append(sql`
      AND row_index > (
        SELECT cursor_row.row_index
        FROM user_rss_feed_import_rows cursor_row
        WHERE cursor_row.id = ${afterRowId}
          AND cursor_row.batch_id = ${importId}
      )`)
  }
  query.append(sql`
    ORDER BY row_index
    LIMIT ${limit + 1}`)
  const { rows } = await read<ImportReadRow>(query)

  const results = rows.slice(0, limit).map(toImportRowResult)
  return {
    import: summary,
    rows: results,
    page_info: buildPageInfo(results, {
      hasNextPage: rows.length > limit,
      getCursor: row => ({ id: row.id, scope }),
    }),
  }
}

export async function getRssFeedImportRowWithBatch(rowId: string): Promise<{
  batch: Pick<
    UserRssFeedImportBatchRow,
    | 'id'
    | 'user_id'
    | 'created_via'
    | 'created_via_oauth_client_id'
    | 'should_follow_imported_feeds'
  >
  row: Pick<UserRssFeedImportRow, 'id' | 'input_url' | 'completed_at' | 'failed_at'>
} | null> {
  if (!isUUID(rowId)) return null

  const { rows } = await read(
    sql`/* getRssFeedImportRowWithBatch */
      SELECT
        r.id, r.batch_id, r.input_url, r.completed_at, r.failed_at,
        b.user_id AS batch_user_id,
        b.created_via AS batch_created_via,
        b.created_via_oauth_client_id AS batch_created_via_oauth_client_id,
        b.should_follow_imported_feeds AS batch_follow
      FROM user_rss_feed_import_rows r
      JOIN user_rss_feed_import_batches b ON b.id = r.batch_id
      WHERE r.id = ${rowId}
      LIMIT 1
    `,
  )
  const raw = rows[0] as
    | (Pick<
        UserRssFeedImportRow,
        'id' | 'batch_id' | 'input_url' | 'completed_at' | 'failed_at'
      > & {
        batch_user_id: string
        batch_created_via: UserRssFeedImportBatchRow['created_via']
        batch_created_via_oauth_client_id: string | null
        batch_follow: boolean
      })
    | undefined
  if (!raw) return null

  return {
    batch: {
      id: raw.batch_id,
      user_id: raw.batch_user_id,
      created_via: raw.batch_created_via,
      created_via_oauth_client_id: raw.batch_created_via_oauth_client_id,
      should_follow_imported_feeds: raw.batch_follow,
    },
    row: {
      id: raw.id,
      input_url: raw.input_url,
      completed_at: raw.completed_at,
      failed_at: raw.failed_at,
    },
  }
}
