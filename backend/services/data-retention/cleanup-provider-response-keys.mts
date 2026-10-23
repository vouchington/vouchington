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
  keyIds?: readonly string[]
  query?: TransactionQuery
}

type Progress = { cursor_id: string | null; sweep_upper_bound_id: string | null }

export async function cleanupOldProviderResponseKeys(
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
    deleteProviderResponseKeyPage(getMinUUIDv7ForDate(cutoff), batchSize, options),
  )
}

async function deleteProviderResponseKeyPage(
  cutoffId: string,
  batchSize: number,
  options: Options,
): Promise<PersistedPage<string>> {
  return runKeysetRetentionPage({
    query: options.query,
    batchSize,
    lockProgress: async query => {
      await query(`/* ensureProviderResponseKeyRetentionCursor */
        INSERT INTO ai_usage_response_key_retention_cursors (is_singleton)
        VALUES (TRUE) ON CONFLICT DO NOTHING`)
      return (
        await query<Progress>(`/* lockProviderResponseKeyRetentionCursor */
          SELECT cursor_id, sweep_upper_bound_id
          FROM ai_usage_response_key_retention_cursors WHERE is_singleton FOR UPDATE`)
      ).rows[0]!
    },
    upperBound: progress => progress.sweep_upper_bound_id ?? cutoffId,
    select: async (query, progress, upperBound, limit) => {
      const scope = options.keyIds ? 'AND id = ANY($3::uuid[])' : ''
      const lower = options.lowerBoundDate ? `AND id >= $${options.keyIds ? 4 : 3}::uuid` : ''
      const limitPosition =
        3 + Number(Boolean(options.keyIds)) + Number(Boolean(options.lowerBoundDate))
      const { rows } = await query<{ id: string }>(
        `/* selectProviderResponseKeyRetentionPage */
        SELECT id FROM ai_usage_provider_response_keys
        WHERE id < $1::uuid
          AND id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          ${scope} ${lower}
        ORDER BY id LIMIT $${limitPosition} FOR UPDATE`,
        [
          upperBound,
          progress.cursor_id,
          ...(options.keyIds ? [options.keyIds] : []),
          ...(options.lowerBoundDate ? [getMinUUIDv7ForDate(options.lowerBoundDate)] : []),
          limit,
        ],
      )
      return rows
    },
    apply: async (query, page) => {
      const { rowCount } = await query(
        `/* deleteProviderResponseKeyPage */
        DELETE FROM ai_usage_provider_response_keys WHERE id = ANY($1::uuid[])`,
        [page.map(row => row.id)],
      )
      return rowCount ?? 0
    },
    checkpoint: async (query, { last, hasMore, upperBound }) => {
      await query(
        `/* checkpointProviderResponseKeyRetentionPage */
        UPDATE ai_usage_response_key_retention_cursors
        SET cursor_id = $1::uuid, sweep_upper_bound_id = $2::uuid WHERE is_singleton`,
        [hasMore ? last!.id : null, hasMore ? upperBound : null],
      )
    },
    continuation: last => last.id,
  })
}
