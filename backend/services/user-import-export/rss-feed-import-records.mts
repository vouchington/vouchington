import { read, beginTransaction, write } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
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
  urls: string[],
  follow: boolean,
): Promise<CreateUserRssFeedImportResult> {
  await using query = await beginTransaction()
  const { rows: batchRows } = await write(
    sql`/* createRssFeedImport */
        INSERT INTO user_rss_feed_import_batches (
          user_id,
          follow,
          total_rows
        )
        VALUES (
          ${userId},
          ${follow},
          ${urls.length}
        )
        RETURNING *
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
      SELECT *
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
      SELECT *
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
  batch: UserRssFeedImportBatchRow
  row: UserRssFeedImportRow
} | null> {
  if (!isUUID(rowId)) return null

  const { rows } = await read(
    sql`/* getRssFeedImportRowWithBatch */
      SELECT
        r.*,
        b.user_id AS batch_user_id,
        b.follow AS batch_follow,
        b.total_rows AS batch_total_rows,
        b.completed_rows AS batch_completed_rows,
        b.failed_rows AS batch_failed_rows,
        b.completed_at AS batch_completed_at,
        b.created_at AS batch_created_at
      FROM user_rss_feed_import_rows r
      JOIN user_rss_feed_import_batches b ON b.id = r.batch_id
      WHERE r.id = ${rowId}
      LIMIT 1
    `,
  )
  const raw = rows[0] as
    | (UserRssFeedImportRow & {
        batch_user_id: string
        batch_follow: boolean
        batch_total_rows: number
        batch_completed_rows: number
        batch_failed_rows: number
        batch_completed_at: Date | null
        batch_created_at: Date
      })
    | undefined
  if (!raw) return null

  return {
    batch: {
      id: raw.batch_id,
      user_id: raw.batch_user_id,
      follow: raw.batch_follow,
      total_rows: raw.batch_total_rows,
      completed_rows: raw.batch_completed_rows,
      failed_rows: raw.batch_failed_rows,
      completed_at: raw.batch_completed_at,
      created_at: raw.batch_created_at,
    },
    row: raw,
  }
}
