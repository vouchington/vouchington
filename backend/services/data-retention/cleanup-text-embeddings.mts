import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { runPersistedRetentionPages, type PersistedPage } from './run-persisted-pages.mts'

type Options = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
  contentHashes?: readonly string[]
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
  const candidatesQuery = sql`
    /* selectTextEmbeddingRetentionPage */
    WITH candidates AS MATERIALIZED (
      SELECT cache.content_sha256, cache.updated_at
      FROM bedrock_nova_multimodal_v1_embeddings cache
      WHERE cache.updated_at < ${cutoff}`
  if (options.lowerBoundDate) {
    candidatesQuery.append(sql` AND cache.updated_at >= ${options.lowerBoundDate}`)
  }
  if (options.contentHashes) {
    candidatesQuery.append(sql` AND cache.content_sha256 = ANY(
      SELECT decode(hash, 'hex') FROM unnest(${options.contentHashes}::text[]) hash)`)
  }
  candidatesQuery.append(sql`
      ORDER BY cache.updated_at, encode(cache.content_sha256, 'hex')
      LIMIT ${batchSize + 1}
    ), candidate_stats AS MATERIALIZED (
      SELECT count(*)::int AS candidate_count FROM candidates
    ), locked AS MATERIALIZED (
      SELECT cache.content_sha256
      FROM bedrock_nova_multimodal_v1_embeddings cache
      JOIN candidates USING (content_sha256)
      WHERE cache.updated_at < ${cutoff}`)
  if (options.lowerBoundDate) {
    candidatesQuery.append(sql` AND cache.updated_at >= ${options.lowerBoundDate}`)
  }
  candidatesQuery.append(sql`
      ORDER BY cache.content_sha256
      FOR UPDATE OF cache
    )
    SELECT encode(locked.content_sha256, 'hex') AS content_sha256,
      candidate_stats.candidate_count
    FROM candidate_stats
    LEFT JOIN (locked JOIN candidates USING (content_sha256)) ON TRUE
    ORDER BY candidates.updated_at, encode(candidates.content_sha256, 'hex')`)
  const { rows: candidates } = await query<{
    content_sha256: string | null
    candidate_count: number
  }>(candidatesQuery)
  const hashes = candidates
    .flatMap(row => (row.content_sha256 === null ? [] : [row.content_sha256]))
    .slice(0, batchSize)
  const { rowCount } = await query(
    `/* deleteTextEmbeddingRetentionPage */
    DELETE FROM bedrock_nova_multimodal_v1_embeddings
    WHERE content_sha256 = ANY(SELECT decode(hash, 'hex') FROM unnest($1::text[]) hash)`,
    [hashes],
  )
  const hasMore = (candidates[0]?.candidate_count ?? 0) > hashes.length
  await query.commit()
  return {
    deleted: rowCount ?? 0,
    hasMore,
    continuation: null,
  }
}
