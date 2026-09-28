import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { isUUID } from '@modules/utils'
import { batchFromStored, importRowFromStored, type StoredImportBatch } from './input-rows.mts'
import type { ImportBatch, ImportRow } from './types.mts'

const IMPORT_ROW_SQL = sql`
  r.id,
  r.batch_id,
  r.row_index,
  r.completed_at,
  r.failed_at,
  r.error_message,
  r.created_at,
  r.updated_at,
  COALESCE(r.topic_id, r.rss_feed_id) AS created_entity_id,
  to_jsonb(topic) - 'admin_import_row_id' AS topic_input,
  to_jsonb(feed) - 'admin_import_row_id' AS rss_input
`

export type BatchProgress = {
  total: number
  completed: number
  failed: number
  pending: number
}

export async function getImportBatch(batchId: string): Promise<ImportBatch | null> {
  if (!isUUID(batchId)) return null

  const { rows } = await read(
    sql`/* getImportBatch */
    SELECT *
    FROM admin_import_batches
    WHERE id = ${batchId}
    LIMIT 1
  `,
  )

  const row = rows[0] as StoredImportBatch | undefined
  return row ? batchFromStored(row) : null
}

export async function getImportRowsByBatchId(batchId: string): Promise<ImportRow[]> {
  if (!isUUID(batchId)) return []

  const { rows } = await read(
    sql`/* getImportRowsByBatchId */
    SELECT `.append(IMPORT_ROW_SQL).append(sql`
    FROM admin_import_rows r
    LEFT JOIN admin_import_topic_rows topic ON topic.admin_import_row_id = r.id
    LEFT JOIN admin_import_rss_feed_rows feed ON feed.admin_import_row_id = r.id
    WHERE r.batch_id = ${batchId}
    ORDER BY r.row_index ASC
  `),
  )

  return rows.map(row =>
    importRowFromStored(
      row as ImportRow & {
        topic_input: Record<string, unknown> | null
        rss_input: Record<string, unknown> | null
      },
    ),
  )
}

export async function getImportBatchProgress(batchId: string): Promise<BatchProgress> {
  if (!isUUID(batchId)) return { total: 0, completed: 0, failed: 0, pending: 0 }

  const { rows } = await read(
    sql`/* getImportBatchProgress */
    SELECT
      COUNT(*) AS total,
      COUNT(completed_at) AS completed,
      COUNT(failed_at) AS failed
    FROM admin_import_rows
    WHERE batch_id = ${batchId}
  `,
  )

  const row = rows[0] as { total: string; completed: string; failed: string }
  const total = Number(row?.total ?? 0)
  const completed = Number(row?.completed ?? 0)
  const failed = Number(row?.failed ?? 0)

  return {
    total,
    completed,
    failed,
    pending: total - completed - failed,
  }
}

export type BatchForRow = Pick<ImportBatch, 'id' | 'import_type' | 'created_by_id' | 'metadata'>

export async function getImportRowWithBatch(
  rowId: string,
): Promise<{ batch: BatchForRow; row: ImportRow } | null> {
  if (!isUUID(rowId)) return null

  const { rows } = await read(
    sql`/* getImportRowWithBatch */
    SELECT `.append(IMPORT_ROW_SQL).append(sql`,
      b.import_type AS batch_import_type,
      b.created_by_id AS batch_created_by_id,
      b.metadata_source,
      b.metadata_version
    FROM admin_import_rows r
    JOIN admin_import_batches b ON b.id = r.batch_id
    LEFT JOIN admin_import_topic_rows topic ON topic.admin_import_row_id = r.id
    LEFT JOIN admin_import_rss_feed_rows feed ON feed.admin_import_row_id = r.id
    WHERE r.id = ${rowId}
    LIMIT 1
  `),
  )

  if (!rows[0]) return null

  const raw = rows[0] as ImportRow & {
    topic_input: Record<string, unknown> | null
    rss_input: Record<string, unknown> | null
    batch_import_type: ImportBatch['import_type']
    batch_created_by_id: string
    metadata_source: string | null
    metadata_version: number | null
  }

  const row = importRowFromStored(raw)
  const batch: BatchForRow = {
    id: raw.batch_id,
    import_type: raw.batch_import_type,
    created_by_id: raw.batch_created_by_id,
    metadata: batchFromStored({
      id: raw.batch_id,
      import_type: raw.batch_import_type,
      created_by_id: raw.batch_created_by_id,
      total_rows: 0,
      completed_rows: 0,
      failed_rows: 0,
      completed_at: null,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      metadata_source: raw.metadata_source,
      metadata_version: raw.metadata_version,
    }).metadata,
  }

  return { batch, row }
}
