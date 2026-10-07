import { read, beginTransaction, write } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import sql from 'sql-template-strings'
import {
  type CreateUserRssFeedImportResult,
  type UserRssFeedImport,
  type UserRssFeedImportBatchRow,
  type UserRssFeedImportRow,
  toImportRowResult,
  toImportSummary,
} from './rss-feed-import-types.mts'

export async function createRssFeedImport(
  userId: string,
  provenance: ContentProvenance,
  urls: string[],
  should_follow_imported_feeds: boolean,
): Promise<CreateUserRssFeedImportResult> {
  await using query = await beginTransaction()
  const { rows: batchRows } = await write(
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
  const batch = batchRows[0] as UserRssFeedImportBatchRow

  const { rows: importRows } = await write(
    sql`/* createRssFeedImport */
        INSERT INTO user_rss_feed_import_rows (
          batch_id,
          row_index,
          input_url
        )
        SELECT ${batch.id}, row_index, input_url
        FROM UNNEST(
          ${urls.map((_, index) => index)}::int[],
          ${urls}::text[]
        ) AS t(row_index, input_url)
        RETURNING id
      `,
    { query },
  )

  await query.commit()
  return {
    import: toImportSummary(batch),
    rowIds: (importRows as Array<{ id: string }>).map(row => row.id),
  }
}

export async function getRssFeedImport(
  currentUserId: string,
  importId: string,
): Promise<UserRssFeedImport | null> {
  if (!isUUID(importId)) return null

  const { rows: batchRows } = await read(
    sql`/* getRssFeedImport */
      SELECT id, total_rows, completed_rows, failed_rows, completed_at, created_at
      FROM user_rss_feed_import_batches
      WHERE id = ${importId}
        AND user_id = ${currentUserId}
      LIMIT 1
    `,
  )
  const batch = batchRows[0] as UserRssFeedImportBatchRow | undefined
  if (!batch) return null

  const { rows } = await read(
    sql`/* getRssFeedImport */
      SELECT id, input_url, outcome, error_message, rss_feed_id
      FROM user_rss_feed_import_rows
      WHERE batch_id = ${importId}
      ORDER BY row_index ASC
    `,
  )

  return {
    import: toImportSummary(batch),
    rows: (rows as UserRssFeedImportRow[]).map(toImportRowResult),
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
