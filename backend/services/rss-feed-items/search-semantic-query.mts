import { beginTransaction, read, readPool } from '@data-stores/psql'
import { buildEmbeddingCtes, EMBEDDING_DISTANCE_THRESHOLD } from '@modules/search-utils'
import pgvector from 'pgvector/pg'
import sql, { type SQLStatement } from 'sql-template-strings'
import { appendWhereClauses } from './search-filters.mts'
import type { SemanticRssFeedItemCursor } from './search-semantic-cursor.mts'
import { buildRssFeedItemRelevanceScoreExpression } from './tools/search-relevance-score.mts'
import { getRssFeedItemsWorkLimit } from './work-limits.mts'

/**
 * `relaxed_order` avoids silently dropping nearer rows on resumed HNSW scans (#1751); the outer
 * query re-sorts the bounded prefix by `(ranking_score DESC, published_at DESC, id DESC)`.
 * `hnsw.ef_search` stays at `40` (rather than posts' `100`): with `iterative_scan = relaxed_order`
 * and `max_scan_tuples = 20000`, pgvector resumes graph traversal past the initial 40-entry list
 * to fill the `LIMIT k` prefix, while keeping pgvector's HNSW cost estimate below a parallel
 * sequential scan on 25k-row corpora (at `100`, the planner can flip to Gather Merge + Seq Scan).
 */
export const SEMANTIC_RSS_ITEM_SEARCH_SETTINGS = {
  'hnsw.iterative_scan': 'relaxed_order',
  'hnsw.ef_search': '40',
  'hnsw.max_scan_tuples': '20000',
} as const

export type SemanticRssFeedItemRow = {
  id: string
  published_at: Date
  story_id: string | null
  ranking_score: number
  cursor_published_at: string
}

function getUnscopedCandidateLimit(): number {
  const candidateLimit = getRssFeedItemsWorkLimit('semantic_rss_item_candidate_limit')
  if (!Number.isSafeInteger(candidateLimit) || candidateLimit < 1) {
    throw new Error('Invalid semantic RSS item candidate limit')
  }
  return candidateLimit
}

function appendUnscopedCandidates(query: SQLStatement, baseFilters: SQLStatement[]): void {
  const candidateLimit = getUnscopedCandidateLimit()
  query.append(sql`, semantic_nearest AS MATERIALIZED (
      SELECT
        rss_feed_items.id,
        rss_feed_items.published_at,
        rss_feed_items.story_id,
        (rss_feed_items.bedrock_nova_multimodal_v1_embedding <=> semantic_search_embedding.embedding) AS embedding_distance
      FROM rss_feed_items
      CROSS JOIN semantic_search_embedding`)
  appendWhereClauses(query, [
    ...baseFilters,
    sql`rss_feed_items.bedrock_nova_multimodal_v1_embedding IS NOT NULL`,
  ])
  // A generic plan needs the actual bounded window size to price the HNSW index.
  query
    .append(sql`
      ORDER BY rss_feed_items.bedrock_nova_multimodal_v1_embedding <=> semantic_search_embedding.embedding
      LIMIT `)
    .append(String(candidateLimit)).append(sql`
    ), semantic_candidates AS (
      SELECT
        id,
        published_at,
        story_id,
        (1.0 / (1.0 + embedding_distance)) AS ranking_score,
        to_char(
          published_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ) AS cursor_published_at
      FROM semantic_nearest
      WHERE embedding_distance < ${EMBEDDING_DISTANCE_THRESHOLD}`)
}

function appendFeedScopedCandidates(query: SQLStatement, baseFilters: SQLStatement[]): void {
  query.append(sql`, semantic_candidates AS (
      SELECT
      rss_feed_items.id,
      rss_feed_items.published_at,
      rss_feed_items.story_id,
      `)
  query.append(
    buildRssFeedItemRelevanceScoreExpression({
      hasSemanticSearch: true,
      hasSimilarPostSearch: false,
      hasSimilarTopicSearch: false,
      hasSimilarRssFeedItemSearch: false,
    }),
  )
  query.append(sql` AS ranking_score,
      to_char(
        rss_feed_items.published_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS cursor_published_at
    FROM rss_feed_items
    CROSS JOIN semantic_search_embedding`)
  appendWhereClauses(query, [
    ...baseFilters,
    sql`rss_feed_items.bedrock_nova_multimodal_v1_embedding IS NOT NULL`,
    sql`(rss_feed_items.bedrock_nova_multimodal_v1_embedding <=> semantic_search_embedding.embedding) < ${EMBEDDING_DISTANCE_THRESHOLD}`,
  ])
}

export function buildSemanticRssSearchQuery(options: {
  embedding: number[]
  baseFilters: SQLStatement[]
  isUnscoped: boolean
  cursor: SemanticRssFeedItemCursor | null
  safeLimit: number
}): SQLStatement {
  const embeddingCtes = buildEmbeddingCtes({
    semanticSearchEmbeddingVector: pgvector.toSql(options.embedding) ?? undefined,
  })
  const query = sql`/* searchRssFeedItemsBySemantic */\n    WITH `
  embeddingCtes.forEach((cte, index) => {
    if (index > 0) query.append(sql`, `)
    query.append(cte)
  })
  if (options.isUnscoped) appendUnscopedCandidates(query, options.baseFilters)
  else appendFeedScopedCandidates(query, options.baseFilters)
  query.append(sql`
    ), deduped_semantic_candidates AS (
      SELECT
        id,
        published_at,
        story_id,
        ranking_score,
        cursor_published_at,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(story_id::text, id::text)
          ORDER BY ranking_score DESC, published_at DESC, id DESC
        ) AS story_rn
      FROM semantic_candidates
    )
    SELECT id, published_at, story_id, ranking_score, cursor_published_at
    FROM deduped_semantic_candidates
    WHERE story_rn = 1`)
  if (options.cursor) {
    query.append(sql`
      AND (ranking_score, published_at, id) < (
        ${options.cursor.ranking_score},
        ${options.cursor.published_at}::timestamptz,
        ${options.cursor.id}::uuid
      )`)
  }
  return query.append(sql`
    ORDER BY ranking_score DESC, published_at DESC, id DESC
    LIMIT ${options.safeLimit + 1}`)
}

export async function executeSemanticRssQuery(
  query: SQLStatement,
  isUnscoped: boolean,
): Promise<SemanticRssFeedItemRow[]> {
  if (!isUnscoped) return (await read<SemanticRssFeedItemRow>(query)).rows
  await using transaction = await beginTransaction({ client: readPool })
  await transaction(sql`/* executeSemanticRssQuery */
    SELECT set_config('hnsw.iterative_scan', ${SEMANTIC_RSS_ITEM_SEARCH_SETTINGS['hnsw.iterative_scan']}, true),
           set_config('hnsw.ef_search', ${SEMANTIC_RSS_ITEM_SEARCH_SETTINGS['hnsw.ef_search']}, true),
           set_config('hnsw.max_scan_tuples', ${SEMANTIC_RSS_ITEM_SEARCH_SETTINGS['hnsw.max_scan_tuples']}, true),
           set_config('plan_cache_mode', 'force_custom_plan', true)`)
  const { rows } = await transaction<SemanticRssFeedItemRow>(query)
  await transaction.commit()
  return rows
}
