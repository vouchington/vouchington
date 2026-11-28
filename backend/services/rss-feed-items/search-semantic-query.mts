import { HNSW_SEARCH_DEFAULT_SETTINGS, read, readWithHnswSettings } from '@data-stores/psql'
import {
  buildEmbeddingCtes,
  buildSemanticDistanceScore,
  buildSemanticNearestCte,
  EMBEDDING_DISTANCE_THRESHOLD,
} from '@modules/search-utils'
import pgvector from 'pgvector/pg'
import sql, { type SQLStatement } from 'sql-template-strings'
import { appendWhereClauses } from './search-filters.mts'
import type { SemanticRssFeedItemCursor } from './search-semantic-cursor.mts'
import { buildRssFeedItemRelevanceScoreExpression } from './tools/search-relevance-score.mts'
import { getRssFeedItemsWorkLimit, rssFeedItemsWorkMaxValues } from './work-limits.mts'

export type SemanticRssFeedItemRow = {
  id: string
  published_at: Date
  story_id: string | null
  ranking_score: number
  cursor_published_at: string
}

function appendUnscopedCandidates(query: SQLStatement, baseFilters: SQLStatement[]): void {
  query.append(sql`, `).append(
    buildSemanticNearestCte({
      selectColumns: [
        'rss_feed_items.id',
        'rss_feed_items.published_at',
        'rss_feed_items.story_id',
      ],
      from: 'rss_feed_items',
      embeddingColumn: 'rss_feed_items.bedrock_nova_multimodal_v1_embedding',
      whereClauses: baseFilters,
      candidateLimit: getRssFeedItemsWorkLimit('semantic_rss_item_candidate_limit'),
      maxCandidateLimit: rssFeedItemsWorkMaxValues.semantic_rss_item_candidate_limit,
    }),
  ).append(sql`, semantic_candidates AS (
      SELECT
        id,
        published_at,
        story_id,
        `)
  query.append(buildSemanticDistanceScore('embedding_distance')).append(sql` AS ranking_score,
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
  return (await readWithHnswSettings<SemanticRssFeedItemRow>(query, HNSW_SEARCH_DEFAULT_SETTINGS))
    .rows
}
