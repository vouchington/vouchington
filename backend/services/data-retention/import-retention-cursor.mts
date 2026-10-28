import type { TransactionQuery } from '@data-stores/psql'

export type ImportFamily = 'admin' | 'rss'
export type Phase = 'discoveries' | 'rows' | 'batch'

export type Cursor = {
  admin_batch_id: string | null
  rss_batch_id: string | null
  phase: Phase
  cursor_row_id: string | null
  cursor_discovery_url_id: string | null
}
export async function updateCursor(
  query: TransactionQuery,
  family: ImportFamily,
  batchColumn: 'admin_batch_id' | 'rss_batch_id',
  batchId: string | null,
  cursor: Cursor,
): Promise<void> {
  await query(
    `/* updateImportRetentionCursor */ UPDATE import_retention_cursors
     SET ${batchColumn} = $2, phase = $3::import_retention_phases,
         cursor_row_id = $4, cursor_discovery_url_id = $5
     WHERE family = $1::import_retention_families`,
    [family, batchId, cursor.phase, cursor.cursor_row_id, cursor.cursor_discovery_url_id],
  )
}
