import type { TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { runKeysetRetentionPage } from './run-keyset-retention-page.mts'
import { runPersistedRetentionPages, type PersistedPage } from './run-persisted-pages.mts'

type Options = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
  changeIds?: readonly string[]
  query?: TransactionQuery
}

type Progress = { cursor_id: string | null; sweep_upper_bound_id: string | null }

/** A raw id page bounds reads even if every old transition is still protected. */
export async function cleanupOldMediaDeliveryChanges(
  options: Options,
): Promise<PersistedPage<string>> {
  const cutoff = getRetentionCutoffDate(
    normalizeRetentionDays(options.retentionDays, 90),
    options.now,
  )
  if (options.lowerBoundDate && options.lowerBoundDate >= cutoff) {
    return { deleted: 0, hasMore: false, continuation: null }
  }
  return runPersistedRetentionPages(options, batchSize =>
    deleteMediaDeliveryChangePage(getMinUUIDv7ForDate(cutoff), cutoff, batchSize, options),
  )
}

async function deleteMediaDeliveryChangePage(
  cutoffId: string,
  cutoff: Date,
  batchSize: number,
  options: Options,
): Promise<PersistedPage<string>> {
  return runKeysetRetentionPage({
    query: options.query,
    batchSize,
    lockProgress: async query => {
      await query(`/* ensureMediaDeliveryChangeRetentionCursor */
        INSERT INTO media_delivery_change_retention_cursors (is_singleton)
        VALUES (TRUE) ON CONFLICT DO NOTHING`)
      return (
        await query<Progress>(`/* lockMediaDeliveryChangeRetentionCursor */
          SELECT cursor_id, sweep_upper_bound_id
          FROM media_delivery_change_retention_cursors WHERE is_singleton FOR UPDATE`)
      ).rows[0]!
    },
    upperBound: progress => progress.sweep_upper_bound_id ?? cutoffId,
    select: async (query, progress, upperBound, limit) => {
      const scope = options.changeIds ? 'AND id = ANY($3::uuid[])' : ''
      const lower = options.lowerBoundDate ? `AND id >= $${options.changeIds ? 4 : 3}::uuid` : ''
      const limitPosition =
        3 + Number(Boolean(options.changeIds)) + Number(Boolean(options.lowerBoundDate))
      const { rows } = await query<{ id: string }>(
        `/* selectMediaDeliveryChangeRetentionPage */
        SELECT id FROM media_delivery_registry_changes
        WHERE id < $1::uuid
          AND id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          ${scope} ${lower}
        ORDER BY id LIMIT $${limitPosition} FOR UPDATE`,
        [
          upperBound,
          progress.cursor_id,
          ...(options.changeIds ? [options.changeIds] : []),
          ...(options.lowerBoundDate ? [getMinUUIDv7ForDate(options.lowerBoundDate)] : []),
          limit,
        ],
      )
      return rows
    },
    apply: async (query, page, upperBound) => {
      await query(
        `/* authorizeMediaDeliveryChangeRetention */
        SELECT set_config('app.media_delivery_retention_cutoff_id', $1::text, TRUE),
          set_config('app.media_delivery_retention_cutoff_at', $2::text, TRUE)`,
        [upperBound, cutoff],
      )
      const { rowCount } = await query(
        `/* deleteMediaDeliveryChangePage */
        DELETE FROM media_delivery_registry_changes history
        WHERE history.id = ANY($1::uuid[])
          AND history.id < $2::uuid
          AND (history.completed_at IS NULL OR history.completed_at < $3::timestamptz)
          AND NOT (history.change_type = 'completed' AND history.desired_state = 'withheld')
          AND NOT EXISTS (SELECT 1 FROM media_delivery_registry_records record
            WHERE record.latest_change_id = history.id)
          AND NOT EXISTS (SELECT 1 FROM media_delivery_registry_projection_work_items work
            WHERE work.failed_change_id = history.id)`,
        [page.map(row => row.id), upperBound, cutoff],
      )
      return rowCount ?? 0
    },
    checkpoint: async (query, { last, hasMore, upperBound }) => {
      await query(
        `/* checkpointMediaDeliveryChangeRetentionPage */
        UPDATE media_delivery_change_retention_cursors
        SET cursor_id = $1::uuid, sweep_upper_bound_id = $2::uuid WHERE is_singleton`,
        [hasMore ? last!.id : null, hasMore ? upperBound : null],
      )
    },
    continuation: last => last.id,
  })
}
