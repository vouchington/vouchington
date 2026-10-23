import { beginTransaction, read, type TransactionQuery } from '@data-stores/psql'
import { enqueueRebuildBloomFilter } from '@queues/bloom-filters/enqueues'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { runPersistedRetentionPages, type PersistedPage } from './run-persisted-pages.mts'

type Cursor = { updatedAt: string; contentSha256: string }
type Options = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
  /** Existing-DB tests keep their candidate rows and cursor rollback-scoped. */
  contentHashes?: readonly string[]
  query?: TransactionQuery
}

type Progress = {
  cursor_updated_at: string | null
  cursor_content_sha256: string | null
  sweep_upper_bound_updated_at: string | null
}

export async function cleanupTextEmbeddingCache(options: Options): Promise<PersistedPage<Cursor>> {
  const cutoff = getRetentionCutoffDate(
    normalizeRetentionDays(options.retentionDays, 90),
    options.now,
  )
  if (options.lowerBoundDate && options.lowerBoundDate >= cutoff) {
    return { deleted: 0, hasMore: false, continuation: null }
  }
  const result = await runPersistedRetentionPages(options, batchSize =>
    deleteTextEmbeddingCachePage(cutoff, batchSize, options),
  )
  if (!result.hasMore && !options.query && !options.contentHashes) {
    const { rows } = await read<{ bloom_rebuild_generation: string }>(
      `/* readPendingEmbeddingBloomRebuild */
       SELECT bloom_rebuild_generation::text
       FROM bedrock_text_embedding_retention_cursors
       WHERE is_singleton AND is_bloom_rebuild_needed`,
      [],
    )
    const generation = rows[0]?.bloom_rebuild_generation
    if (generation !== undefined) {
      await enqueueRebuildBloomFilter({ filter: 'embedding', retentionGeneration: generation })
    }
  }
  return result
}

async function deleteTextEmbeddingCachePage(
  cutoff: Date,
  batchSize: number,
  options: Options,
): Promise<PersistedPage<Cursor>> {
  await using owned = options.query ? undefined : await beginTransaction()
  const query = options.query ?? owned!
  await query(`/* ensureTextEmbeddingRetentionCursor */
    INSERT INTO bedrock_text_embedding_retention_cursors (is_singleton)
    VALUES (TRUE) ON CONFLICT DO NOTHING`)
  const progress = (
    await query<Progress>(`/* lockTextEmbeddingRetentionCursor */
      SELECT cursor_updated_at::text, encode(cursor_content_sha256, 'hex') AS cursor_content_sha256,
        sweep_upper_bound_updated_at::text
      FROM bedrock_text_embedding_retention_cursors WHERE is_singleton FOR UPDATE`)
  ).rows[0]
  const upperBound = progress.sweep_upper_bound_updated_at ?? cutoff.toISOString()
  const scopedPredicate = options.contentHashes
    ? `AND content_sha256 = ANY(SELECT decode(hash, 'hex') FROM unnest($5::text[]) hash)`
    : ''
  const lowerBoundPredicate = options.lowerBoundDate
    ? `AND updated_at >= $${options.contentHashes ? 6 : 5}::timestamptz`
    : ''
  const { rows: candidates } = await query<{
    content_sha256: string
    updated_at: string
  }>(
    `/* selectTextEmbeddingRetentionPage */
    SELECT encode(content_sha256, 'hex') AS content_sha256, updated_at::text
    FROM bedrock_nova_multimodal_v1_embeddings cache
    WHERE updated_at < $1::timestamptz
      AND (updated_at, encode(content_sha256, 'hex')) >
        (COALESCE($2::timestamptz, '-infinity'::timestamptz),
         COALESCE($3::text, ''))
      ${scopedPredicate}
      ${lowerBoundPredicate}
    ORDER BY cache.updated_at, encode(cache.content_sha256, 'hex')
    LIMIT $4 FOR UPDATE`,
    [
      upperBound,
      progress.cursor_updated_at,
      progress.cursor_content_sha256,
      batchSize + 1,
      ...(options.contentHashes ? [options.contentHashes] : []),
      ...(options.lowerBoundDate ? [options.lowerBoundDate] : []),
    ],
  )
  const page = candidates.slice(0, batchSize)
  const hashes = page.map(row => row.content_sha256)
  const { rowCount } = await query(
    `/* deleteTextEmbeddingRetentionPage */
    DELETE FROM bedrock_nova_multimodal_v1_embeddings
    WHERE content_sha256 = ANY(SELECT decode(hash, 'hex') FROM unnest($1::text[]) hash)`,
    [hashes],
  )
  const last = page.at(-1)
  const hasMore = candidates.length > batchSize
  await query(
    `/* checkpointTextEmbeddingRetentionPage */
    UPDATE bedrock_text_embedding_retention_cursors
    SET cursor_updated_at = $1::timestamptz,
      cursor_content_sha256 = decode($2::text, 'hex'),
      sweep_upper_bound_updated_at = $3::timestamptz,
      bloom_rebuild_generation = bloom_rebuild_generation + CASE WHEN $4::boolean THEN 1 ELSE 0 END,
      is_bloom_rebuild_needed = is_bloom_rebuild_needed OR $4::boolean
    WHERE is_singleton`,
    [
      hasMore ? last!.updated_at : null,
      hasMore ? last!.content_sha256 : null,
      hasMore ? upperBound : null,
      (rowCount ?? 0) > 0,
    ],
  )
  if (owned) await owned.commit()
  return {
    deleted: rowCount ?? 0,
    hasMore,
    continuation: hasMore
      ? { updatedAt: last!.updated_at, contentSha256: last!.content_sha256 }
      : null,
  }
}
