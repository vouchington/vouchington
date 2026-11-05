import { beginTransaction } from '@data-stores/psql'
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
  await using query = await beginTransaction()
  const lowerBoundPredicate = options.lowerBoundDate ? 'AND updated_at >= $3::timestamptz' : ''
  const { rows: candidates } = await query<{
    content_sha256: string
  }>(
    `/* selectTextEmbeddingRetentionPage */
    SELECT encode(content_sha256, 'hex') AS content_sha256
    FROM bedrock_nova_multimodal_v1_embeddings cache
    WHERE updated_at < $1::timestamptz
      ${lowerBoundPredicate}
    ORDER BY cache.updated_at, encode(cache.content_sha256, 'hex')
    LIMIT $2 FOR UPDATE`,
    [cutoff, batchSize + 1, ...(options.lowerBoundDate ? [options.lowerBoundDate] : [])],
  )
  const page = candidates.slice(0, batchSize)
  const hashes = page.map(row => row.content_sha256)
  const { rowCount } = await query(
    `/* deleteTextEmbeddingRetentionPage */
    DELETE FROM bedrock_nova_multimodal_v1_embeddings
    WHERE content_sha256 = ANY(SELECT decode(hash, 'hex') FROM unnest($1::text[]) hash)`,
    [hashes],
  )
  const hasMore = candidates.length > batchSize
  await query.commit()
  return {
    deleted: rowCount ?? 0,
    hasMore,
    continuation: null,
  }
}
