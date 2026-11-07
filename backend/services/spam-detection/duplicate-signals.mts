import onError from '@modules/on-error'
import { beginTransaction, read, readPool } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { EMBEDDINGS_SIMILARITY_THRESHOLD } from './config.mts'
import type { SpamSignalResult } from './types.mts'
import { getSpamDetectionWorkLimit } from './work-limits.mts'

/** Nearest other-user posts the similarity probe inspects; the threshold decides within them. */
const SIMILARITY_CANDIDATE_LIMIT = 10

/** Cap on index tuples one similarity probe may visit while filters discard candidates. */
export const SIMILARITY_MAX_SCAN_TUPLES = 20000

/** Transaction-local pgvector settings the similarity probe applies; the EXPLAIN replay reuses them. */
export const SIMILARITY_SCAN_SETTINGS = {
  'hnsw.iterative_scan': 'relaxed_order',
  'hnsw.max_scan_tuples': String(SIMILARITY_MAX_SCAN_TUPLES),
} as const

export async function checkContentHashDuplicate(
  contentSha256: Buffer,
  userId: string,
): Promise<SpamSignalResult> {
  const lookbackDays = getSpamDetectionWorkLimit('content_hash_lookback_days')
  const { rows } = await read(sql`/* checkContentHashDuplicate */
    SELECT 1
    FROM posts
    WHERE llm_moderation_content_sha256 = ${contentSha256}
      AND id >= fn_min_uuidv7(CURRENT_TIMESTAMP - make_interval(days => ${lookbackDays}::int))
      AND created_by_id != ${userId}
    LIMIT 1
  `)

  const flagged = rows.length > 0
  return {
    signal: 'content_hash_duplicate',
    score: flagged ? 1.0 : 0.0,
    flagged,
  }
}

export async function checkEmbeddingsSimilarity(
  postId: string,
  userId: string,
): Promise<SpamSignalResult> {
  // Best-effort: if embeddings aren't ready, return safe default
  try {
    const lookbackDays = getSpamDetectionWorkLimit('embeddings_similarity_lookback_days')
    // The id window and the author filters drop rows from an approximate top-k, so the scan keeps
    // walking the index until it has enough survivors (bounded by max_scan_tuples).
    await using transaction = await beginTransaction({ client: readPool })
    await transaction(sql`/* checkEmbeddingsSimilarity settings */
      SELECT set_config('hnsw.iterative_scan', ${SIMILARITY_SCAN_SETTINGS['hnsw.iterative_scan']}, true),
             set_config('hnsw.max_scan_tuples', ${SIMILARITY_SCAN_SETTINGS['hnsw.max_scan_tuples']}, true)`)
    const { rows } = await transaction(sql`/* checkEmbeddingsSimilarity */
      SELECT 1
      FROM (
        SELECT bedrock_nova_multimodal_v1_embedding AS embedding
        FROM posts
        WHERE id = ${postId}
          AND bedrock_nova_multimodal_v1_embedding IS NOT NULL
          AND (bedrock_nova_multimodal_v1_embedding <=> bedrock_nova_multimodal_v1_embedding) = 0
        LIMIT 1
      ) source,
      LATERAL (
        SELECT p.bedrock_nova_multimodal_v1_embedding <=> source.embedding AS distance
        FROM posts p
        WHERE p.bedrock_nova_multimodal_v1_embedding IS NOT NULL
          AND p.id >= fn_min_uuidv7(CURRENT_TIMESTAMP - make_interval(days => ${lookbackDays}::int))
          AND p.id != ${postId}
          AND p.created_by_id != ${userId}
        ORDER BY p.bedrock_nova_multimodal_v1_embedding <=> source.embedding
        LIMIT ${SIMILARITY_CANDIDATE_LIMIT}
      ) nearest
      -- distance form: a zero-vector candidate has NaN distance, which never satisfies <=
      WHERE nearest.distance <= 1 - ${EMBEDDINGS_SIMILARITY_THRESHOLD}::float8
      LIMIT 1
    `)
    await transaction.commit()

    const flagged = rows.length > 0
    return {
      signal: 'embeddings_similarity',
      score: flagged ? 1.0 : 0.0,
      flagged,
    }
  } catch (err) {
    // Best-effort: keep the safe default, but surface transaction/settings/query failures.
    onError(err instanceof Error ? err : new Error(String(err)))
    return {
      signal: 'embeddings_similarity',
      score: 0,
      flagged: false,
      details: { skipped: true },
    }
  }
}
