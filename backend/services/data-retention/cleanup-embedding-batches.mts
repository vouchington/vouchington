import type { TransactionQuery } from '@data-stores/psql'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { runKeysetRetentionPage } from './run-keyset-retention-page.mts'
import { runPersistedRetentionPages, type PersistedPage } from './run-persisted-pages.mts'

type Cursor = { terminalAt: string; batchId: string }
type Options = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
  /** Existing-DB tests use an owned ID set and a rollback-scoped cursor. */
  batchIds?: readonly string[]
  query?: TransactionQuery
}
type Progress = {
  cursor_terminal_at: string | null
  cursor_batch_id: string | null
  sweep_upper_bound_terminal_at: string | null
}

export async function cleanupTerminalEmbeddingBatches(
  options: Options,
): Promise<PersistedPage<Cursor>> {
  const cutoff = getRetentionCutoffDate(
    normalizeRetentionDays(options.retentionDays, 30),
    options.now,
  )
  if (options.lowerBoundDate && options.lowerBoundDate >= cutoff) {
    return { deleted: 0, hasMore: false, continuation: null }
  }
  return runPersistedRetentionPages(options, batchSize =>
    deleteTerminalEmbeddingBatchPage(cutoff, batchSize, options),
  )
}

async function deleteTerminalEmbeddingBatchPage(
  cutoff: Date,
  batchSize: number,
  options: Options,
): Promise<PersistedPage<Cursor>> {
  return runKeysetRetentionPage({
    query: options.query,
    batchSize,
    lockProgress: async query => {
      await query(`/* ensureEmbeddingBatchRetentionCursor */
        INSERT INTO bedrock_embedding_batch_retention_cursors (is_singleton)
        VALUES (TRUE) ON CONFLICT DO NOTHING`)
      return (
        await query<Progress>(`/* lockEmbeddingBatchRetentionCursor */
          SELECT cursor_terminal_at::text, cursor_batch_id,
            sweep_upper_bound_terminal_at::text
          FROM bedrock_embedding_batch_retention_cursors WHERE is_singleton FOR UPDATE`)
      ).rows[0]!
    },
    upperBound: progress => progress.sweep_upper_bound_terminal_at ?? cutoff.toISOString(),
    select: async (query, progress, upperBound, limit) => {
      const scopedPredicate = options.batchIds ? 'AND id = ANY($5::uuid[])' : ''
      const lowerBoundPredicate = options.lowerBoundDate
        ? `AND COALESCE(completed_at, failed_at, cancelled_at) >= $${options.batchIds ? 6 : 5}::timestamptz`
        : ''
      const { rows } = await query<{ id: string; terminal_at: string }>(
        `/* selectEmbeddingBatchRetentionPage */
        SELECT id, COALESCE(completed_at, failed_at, cancelled_at)::text AS terminal_at
        FROM bedrock_embedding_batches
        WHERE (completed_at IS NOT NULL OR failed_at IS NOT NULL OR cancelled_at IS NOT NULL)
          AND COALESCE(completed_at, failed_at, cancelled_at) < $1::timestamptz
          AND (COALESCE(completed_at, failed_at, cancelled_at), id) >
            (COALESCE($2::timestamptz, '-infinity'::timestamptz),
             COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid))
          ${scopedPredicate}
          ${lowerBoundPredicate}
        ORDER BY COALESCE(completed_at, failed_at, cancelled_at), id
        LIMIT $4 FOR UPDATE`,
        [
          upperBound,
          progress.cursor_terminal_at,
          progress.cursor_batch_id,
          limit,
          ...(options.batchIds ? [options.batchIds] : []),
          ...(options.lowerBoundDate ? [options.lowerBoundDate] : []),
        ],
      )
      return rows
    },
    apply: async (query, page) => {
      const { rowCount } = await query(
        `/* deleteTerminalEmbeddingBatchPage */
        DELETE FROM bedrock_embedding_batches WHERE id = ANY($1::uuid[])`,
        [page.map(row => row.id)],
      )
      return rowCount ?? 0
    },
    checkpoint: async (query, { last, hasMore, upperBound }) => {
      await query(
        `/* checkpointEmbeddingBatchRetentionPage */
        UPDATE bedrock_embedding_batch_retention_cursors
        SET cursor_terminal_at = $1::timestamptz, cursor_batch_id = $2::uuid,
          sweep_upper_bound_terminal_at = $3::timestamptz
        WHERE is_singleton`,
        [
          hasMore ? last!.terminal_at : null,
          hasMore ? last!.id : null,
          hasMore ? upperBound : null,
        ],
      )
    },
    continuation: last => ({ terminalAt: last.terminal_at, batchId: last.id }),
  })
}
