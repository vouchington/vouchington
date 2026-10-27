import { beginTransaction } from '@data-stores/psql'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { runPersistedRetentionPages, type PersistedPage } from './run-persisted-pages.mts'

type Cursor = { terminalAt: string; batchId: string }
type Options = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
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
  await using query = await beginTransaction()
  const lowerBoundPredicate = options.lowerBoundDate
    ? 'AND COALESCE(completed_at, failed_at, cancelled_at) >= $3::timestamptz'
    : ''
  const { rows: candidates } = await query<{ id: string; terminal_at: string }>(
    `/* selectEmbeddingBatchRetentionPage */
    SELECT id, COALESCE(completed_at, failed_at, cancelled_at)::text AS terminal_at
    FROM bedrock_embedding_batches
    WHERE (completed_at IS NOT NULL OR failed_at IS NOT NULL OR cancelled_at IS NOT NULL)
      AND COALESCE(completed_at, failed_at, cancelled_at) < $1::timestamptz
      ${lowerBoundPredicate}
    ORDER BY COALESCE(completed_at, failed_at, cancelled_at), id
    LIMIT $2 FOR UPDATE SKIP LOCKED`,
    [cutoff, batchSize + 1, ...(options.lowerBoundDate ? [options.lowerBoundDate] : [])],
  )
  const page = candidates.slice(0, batchSize)
  const ids = page.map(row => row.id)
  // One association budget covers the entire parent page, including a large first batch.
  await query(
    `/* deleteEmbeddingBatchEntityPage */
    WITH selected AS (
      SELECT ctid FROM bedrock_embedding_batch_entities
      WHERE batch_id = ANY($1::uuid[])
      ORDER BY batch_id LIMIT $2
    )
    DELETE FROM bedrock_embedding_batch_entities entity
    USING selected WHERE entity.ctid = selected.ctid`,
    [ids, batchSize],
  )
  const { rowCount } = await query(
    `/* deleteTerminalEmbeddingBatchPage */
    DELETE FROM bedrock_embedding_batches batch
    WHERE batch.id = ANY($1::uuid[])
      AND NOT EXISTS (SELECT 1 FROM bedrock_embedding_batch_entities entity
        WHERE entity.batch_id = batch.id)`,
    [ids],
  )
  const deleted = rowCount ?? 0
  const hasMore = candidates.length > batchSize || deleted < page.length
  await query.commit()
  const last = page.at(-1)
  return {
    deleted,
    hasMore,
    continuation: hasMore && last ? { terminalAt: last.terminal_at, batchId: last.id } : null,
  }
}
