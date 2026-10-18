import { beginTransaction, write } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import sql from 'sql-template-strings'
import { getUserImportExportConfig } from './config.mts'
import {
  type CreateUserRssFeedImportResult,
  type UserRssFeedImportBatchRow,
  type UserRssFeedImportRow,
  toImportSummary,
} from './rss-feed-import-types.mts'

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

  // The dispatcher can pick up a newly committed row before a read replica has replayed it.
  const { rows } = await write(
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
