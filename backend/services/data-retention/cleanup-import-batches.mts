import { beginTransaction } from '@data-stores/psql'
import {
  updateCursor,
  type Cursor,
  type ImportFamily,
  type Phase,
} from './import-retention-cursor.mts'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { DATA_RETENTION_MAX_VALUES } from './config.mts'
import { runPersistedRetentionPages } from './run-persisted-pages.mts'

type Position = {
  batchId: string
  phase: Phase
  rowId: string | null
  discoveryUrlId: string | null
}
type Result = { deleted: number; hasMore: boolean; continuation: Position | null }
type Options = {
  batchSize?: number
  maxBatches: number
  retentionDays?: number
  now?: Date
  lowerBoundDate?: Date
}
const MIN_UUIDV7 = '00000000-0000-7000-8000-000000000000'

/** Each pass commits at most one child page or one empty parent, together with its cursor. */
export async function cleanupCompletedImportBatches(
  family: ImportFamily,
  options: Options,
): Promise<Result> {
  const cutoff = getRetentionCutoffDate(
    normalizeRetentionDays(options.retentionDays, 90),
    options.now,
  )
  return runPersistedRetentionPages(
    options,
    batchSize => deleteCompletedImportPage(family, cutoff, batchSize, options.lowerBoundDate),
    {
      batchSize: DATA_RETENTION_MAX_VALUES.batch_size,
      maxBatches: DATA_RETENTION_MAX_VALUES.max_batches_per_run,
    },
  )
}

async function deleteCompletedImportPage(
  family: ImportFamily,
  cutoff: Date,
  batchSize: number,
  lowerBound?: Date,
): Promise<Result> {
  await using query = await beginTransaction()
  await query(
    `/* ensureImportRetentionCursor */
     INSERT INTO import_retention_cursors (family, phase)
     VALUES ($1::import_retention_families, $2::import_retention_phases)
     ON CONFLICT (family) DO NOTHING`,
    [family, family === 'rss' ? 'discoveries' : 'rows'],
  )
  const { rows: cursorRows } = await query<Cursor>(
    `/* lockImportRetentionCursor */
     SELECT admin_batch_id, rss_batch_id, phase, row_id, discovery_url_id
     FROM import_retention_cursors WHERE family = $1::import_retention_families FOR UPDATE`,
    [family],
  )
  const cursor = cursorRows[0]!
  const batchColumn = family === 'admin' ? 'admin_batch_id' : 'rss_batch_id'
  const batchTable = family === 'admin' ? 'admin_import_batches' : 'user_rss_feed_import_batches'
  let batchId = cursor[batchColumn]
  if (batchId) {
    const { rows } = await query<{ id: string }>(
      `/* lockCurrentImportRetentionBatch */
       SELECT id FROM ${batchTable} WHERE id = $1 AND completed_at < $2
         AND completed_at >= $3 FOR UPDATE`,
      [batchId, cutoff, lowerBound ?? new Date(0)],
    )
    if (rows.length === 0) batchId = null
  }
  if (!batchId) {
    const { rows } = await query<{ id: string }>(
      `/* selectCompletedImportRetentionBatch */
       SELECT id FROM ${batchTable}
       WHERE completed_at IS NOT NULL AND completed_at < $1
         AND completed_at >= $2
       ORDER BY completed_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [cutoff, lowerBound ?? new Date(0)],
    )
    batchId = rows[0]?.id ?? null
    if (!batchId) {
      await query.commit()
      return { deleted: 0, hasMore: false, continuation: null }
    }
    cursor.phase = family === 'rss' ? 'discoveries' : 'rows'
    cursor.row_id = null
    cursor.discovery_url_id = null
    await updateCursor(query, family, batchColumn, batchId, cursor)
  }

  let deleted = 0
  if (cursor.phase === 'discoveries') {
    const { rows } = await query<{ import_row_id: string; discovery_url_id: string }>(
      `/* selectImportDiscoveryRetentionPage */
       SELECT import_row_id, discovery_url_id
       FROM user_rss_feed_import_row_discoveries
       WHERE batch_id = $1
         AND (import_row_id, discovery_url_id) > ($2::uuid, $3::uuid)
       ORDER BY import_row_id, discovery_url_id LIMIT $4 FOR UPDATE`,
      [batchId, cursor.row_id ?? MIN_UUIDV7, cursor.discovery_url_id ?? MIN_UUIDV7, batchSize + 1],
    )
    const page = rows.slice(0, batchSize)
    if (page.length > 0) {
      const last = page.at(-1)!
      const { rowCount } = await query(
        `/* deleteImportDiscoveryRetentionPage */
         DELETE FROM user_rss_feed_import_row_discoveries
         WHERE batch_id = $1 AND (import_row_id, discovery_url_id) IN (
           SELECT * FROM unnest($2::uuid[], $3::uuid[])
         )`,
        [batchId, page.map(row => row.import_row_id), page.map(row => row.discovery_url_id)],
      )
      deleted = rowCount ?? 0
      cursor.row_id = last.import_row_id
      cursor.discovery_url_id = last.discovery_url_id
    }
    if (rows.length <= batchSize) {
      cursor.phase = 'rows'
      cursor.row_id = null
      cursor.discovery_url_id = null
    }
  } else if (cursor.phase === 'rows') {
    const rowTable = family === 'admin' ? 'admin_import_rows' : 'user_rss_feed_import_rows'
    const { rows } = await query<{ id: string }>(
      `/* selectImportRowRetentionPage */
       SELECT id FROM ${rowTable} WHERE batch_id = $1
         AND id > $2::uuid
       ORDER BY id LIMIT $3 FOR UPDATE`,
      [batchId, cursor.row_id ?? MIN_UUIDV7, batchSize + 1],
    )
    const page = rows.slice(0, batchSize)
    if (page.length > 0) {
      const { rowCount } = await query(
        `/* deleteImportRowRetentionPage */ DELETE FROM ${rowTable}
         WHERE batch_id = $1 AND id = ANY($2::uuid[])`,
        [batchId, page.map(row => row.id)],
      )
      deleted = rowCount ?? 0
      cursor.row_id = page.at(-1)!.id
    }
    if (rows.length <= batchSize) {
      cursor.phase = 'batch'
      cursor.row_id = null
    }
  } else {
    const rowTable = family === 'admin' ? 'admin_import_rows' : 'user_rss_feed_import_rows'
    const { rowCount } = await query(
      `/* deleteCompletedImportBatch */ DELETE FROM ${batchTable}
       WHERE id = $1 AND completed_at < $2
         AND NOT EXISTS (SELECT 1 FROM ${rowTable} WHERE batch_id = $1 LIMIT 1)
         ${family === 'rss' ? 'AND NOT EXISTS (SELECT 1 FROM user_rss_feed_import_row_discoveries WHERE batch_id = $1 LIMIT 1)' : ''}`,
      [batchId, cutoff],
    )
    deleted = rowCount ?? 0
    if (deleted > 0) batchId = null
    cursor.phase = family === 'rss' ? 'discoveries' : 'rows'
    cursor.row_id = null
    cursor.discovery_url_id = null
  }
  await updateCursor(query, family, batchColumn, batchId, cursor)
  let hasMore = batchId !== null
  if (!hasMore) {
    const { rows } = await query(
      `/* nextCompletedImportRetentionBatch */
      SELECT id FROM ${batchTable}
      WHERE completed_at IS NOT NULL AND completed_at < $1
        AND completed_at >= $2
      ORDER BY completed_at, id LIMIT 1`,
      [cutoff, lowerBound ?? new Date(0)],
    )
    hasMore = rows.length > 0
  }
  await query.commit()
  return {
    deleted,
    hasMore,
    continuation: batchId
      ? {
          batchId,
          phase: cursor.phase,
          rowId: cursor.row_id,
          discoveryUrlId: cursor.discovery_url_id,
        }
      : null,
  }
}
