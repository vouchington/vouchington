import type { TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { deleteMediaDeliveryChangePage } from './delete-media-delivery-change-page.mts'
import { runKeysetRetentionPage } from './run-keyset-retention-page.mts'
import { runPersistedRetentionPages, type PersistedPage } from './run-persisted-pages.mts'

type Options = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
  query?: TransactionQuery
}

type Progress = { cursor_change_id: string | null; sweep_upper_bound_change_id: string | null }

/** A static-eligible id page bounds reads even if every old transition is still referenced. */
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
    deleteMediaDeliveryChangeSweepPage(getMinUUIDv7ForDate(cutoff), cutoff, batchSize, options),
  )
}

async function deleteMediaDeliveryChangeSweepPage(
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
          SELECT cursor_change_id, sweep_upper_bound_change_id
          FROM media_delivery_change_retention_cursors WHERE is_singleton FOR UPDATE`)
      ).rows[0]!
    },
    upperBound: progress => progress.sweep_upper_bound_change_id ?? cutoffId,
    select: async (query, progress, upperBound, limit) => {
      const lower = options.lowerBoundDate ? 'AND id >= $3::uuid' : ''
      const { rows } = await query<{ id: string }>(
        `/* selectMediaDeliveryChangeRetentionPage */
        SELECT id FROM media_delivery_registry_changes
        WHERE id < $1::uuid
          AND id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          AND NOT (change_type = 'completed' AND desired_state = 'withheld')
          ${lower}
        ORDER BY id LIMIT $${options.lowerBoundDate ? 4 : 3} FOR UPDATE`,
        [
          upperBound,
          progress.cursor_change_id,
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
      return deleteMediaDeliveryChangePage(
        query,
        page.map(row => row.id),
        upperBound,
        cutoff,
      )
    },
    checkpoint: async (query, { last, hasMore, upperBound }) => {
      await query(
        `/* checkpointMediaDeliveryChangeRetentionPage */
        UPDATE media_delivery_change_retention_cursors
        SET cursor_change_id = $1::uuid, sweep_upper_bound_change_id = $2::uuid WHERE is_singleton`,
        [hasMore ? last!.id : null, hasMore ? upperBound : null],
      )
    },
    continuation: last => last.id,
  })
}
