import { write } from '@data-stores/psql'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { runPersistedRetentionPages, type PersistedPage } from './run-persisted-pages.mts'

type Options = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
}

export async function cleanupTextEmbeddingCache(options: Options): Promise<PersistedPage<never>> {
  const cutoff = getRetentionCutoffDate(
    normalizeRetentionDays(options.retentionDays, 90),
    options.now,
  )
  if (options.lowerBoundDate && options.lowerBoundDate >= cutoff) {
    return { deleted: 0, hasMore: false, continuation: null }
  }
  return runPersistedRetentionPages(options, batchSize =>
    deleteTextEmbeddingCachePage(cutoff, batchSize, options),
  )
}

async function deleteTextEmbeddingCachePage(
  cutoff: Date,
  batchSize: number,
  options: Options,
): Promise<PersistedPage<never>> {
  const lowerBoundPredicate = options.lowerBoundDate ? 'AND updated_at >= $3::timestamptz' : ''
  const { rows } = await write<{ content_sha256: Buffer }>(
    `/* deleteTextEmbeddingRetentionPage */
    DELETE FROM bedrock_nova_multimodal_v1_embeddings
    WHERE content_sha256 IN (
      SELECT content_sha256
      FROM bedrock_nova_multimodal_v1_embeddings
      WHERE updated_at < $1::timestamptz
        ${lowerBoundPredicate}
      ORDER BY updated_at, content_sha256
      LIMIT $2
    )
      AND updated_at < $1::timestamptz
      ${lowerBoundPredicate}
    RETURNING content_sha256`,
    [cutoff, batchSize, ...(options.lowerBoundDate ? [options.lowerBoundDate] : [])],
  )
  return {
    deleted: rows.length,
    hasMore: rows.length === batchSize,
    continuation: null,
  }
}
