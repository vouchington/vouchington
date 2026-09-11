import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { isUUID } from '@modules/utils'
import type { ImportBatch, ImportRow } from './types.mts'

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

  return (rows[0] as ImportBatch | undefined) ?? null
}

export async function getImportRowsByBatchId(batchId: string): Promise<ImportRow[]> {
  if (!isUUID(batchId)) return []

  const { rows } = await read(
    sql`/* getImportRowsByBatchId */
    SELECT
      row_definition.*,
      COALESCE(row_definition.topic_id, row_definition.crm_contact_id, row_definition.rss_feed_id)
        AS created_entity_id
    FROM admin_import_rows row_definition
    WHERE row_definition.batch_id = ${batchId}
    ORDER BY row_index ASC
  `,
  )

  return rows as ImportRow[]
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
    SELECT
      r.*,
      COALESCE(r.topic_id, r.crm_contact_id, r.rss_feed_id) AS created_entity_id,
      b.import_type AS batch_import_type,
      b.created_by_id AS batch_created_by_id,
      b.metadata AS batch_metadata
    FROM admin_import_rows r
    JOIN admin_import_batches b ON b.id = r.batch_id
    WHERE r.id = ${rowId}
    LIMIT 1
  `,
  )

  if (!rows[0]) return null

  const raw = rows[0] as ImportRow & {
    batch_import_type: string
    batch_created_by_id: string
    batch_metadata: Record<string, unknown> | null
  }

  const row: ImportRow = {
    id: raw.id,
    batch_id: raw.batch_id,
    row_index: raw.row_index,
    input_data: raw.input_data,
    created_entity_id: raw.created_entity_id,
    completed_at: raw.completed_at,
    failed_at: raw.failed_at,
    error_message: raw.error_message,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }

  const batch: BatchForRow = {
    id: raw.batch_id,
    import_type: raw.batch_import_type as ImportBatch['import_type'],
    created_by_id: raw.batch_created_by_id,
    metadata: raw.batch_metadata,
  }

  return { batch, row }
}
