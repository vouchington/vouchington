/**
 * Semantic (embedding-based) search for RSS feed items.
 * Activated when `semantic_search_query` is provided to the public API.
 * Results are ordered by embedding cosine similarity, not recency.
 * Results use a scoped relevance cursor so callers can traverse stable result pages.
 *
 * For the recency-ordered public search, see search.mts.
 * For agent-tool similarity search (similar_post_id, etc.), see tools/search.mts.
 */
import { read } from '@data-stores/psql'
import { buildEmbeddingCtes, clampLimit, EMBEDDING_DISTANCE_THRESHOLD } from '@modules/search-utils'
import { encodeCursor } from '@modules/pagination'
import {
  getCachedSearchEmbedding,
  normalizeSearchEmbeddingQuery,
} from '@services/bedrock-embeddings/search/get-cached'
import pgvector from 'pgvector/pg'
import sql from 'sql-template-strings'
import type { PageInfo } from '@voucha/types/pagination'
import type { RssFeedItemsResult } from './types.mts'
import { buildRssFeedItemFilters, appendWhereClauses } from './search-filters.mts'
import { buildRssFeedItemRelevanceScoreExpression } from './tools/search-relevance-score.mts'
import type { SearchRssFeedItemsOptions } from './search.mts'
import {
  getSemanticRssFeedItemCursor,
  getSemanticRssFeedItemCursorScope,
} from './search-semantic-cursor.mts'

// Semantic search ignores text_search_query; `after` is a scoped relevance cursor.
export type SearchRssFeedItemsBySemanticOptions = Omit<
  SearchRssFeedItemsOptions,
  'text_search_query'
> & {
  semantic_search_query: string
  dependencies?: Partial<SearchRssFeedItemsBySemanticDependencies>
}

type SearchRssFeedItemsBySemanticDependencies = {
  getCachedSearchEmbedding: typeof getCachedSearchEmbedding
}

const defaultDependencies: SearchRssFeedItemsBySemanticDependencies = {
  getCachedSearchEmbedding,
}

export async function searchRssFeedItemsBySemantic(
  options: SearchRssFeedItemsBySemanticOptions,
): Promise<{ results: RssFeedItemsResult[]; page_info: PageInfo }> {
  const dependencies = { ...defaultDependencies, ...options.dependencies }
  const { limit = 10, semantic_search_query } = options
  const safeLimit = clampLimit(limit)
  const cursor = getSemanticRssFeedItemCursor(options.after, options)
  const scope = getSemanticRssFeedItemCursorScope(options)

  const semanticSearchEmbedding = await dependencies.getCachedSearchEmbedding(
    normalizeSearchEmbeddingQuery(semantic_search_query),
  )

  const embeddingCtes = buildEmbeddingCtes({
    semanticSearchEmbeddingVector: pgvector.toSql(semanticSearchEmbedding) ?? undefined,
  })

  // The recency path's timestamp cursor must never leak into relevance search.
  const { after: _after, ...filterOptions } = options
  const baseFilters = buildRssFeedItemFilters(filterOptions)

  const query = sql`/* searchRssFeedItemsBySemantic */\n    WITH `
  embeddingCtes.forEach((cte, index) => {
    if (index > 0) query.append(sql`, `)
    query.append(cte)
  })

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

  query.append(sql`
    ), deduped_semantic_candidates AS (
      SELECT
        semantic_candidates.*,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(story_id::text, id::text)
          ORDER BY ranking_score DESC, published_at DESC, id DESC
        ) AS story_rn
      FROM semantic_candidates
    )
    SELECT id, published_at, story_id, ranking_score, cursor_published_at
    FROM deduped_semantic_candidates
    WHERE story_rn = 1`)
  if (cursor) {
    query.append(sql`
      AND (ranking_score, published_at, id) < (
        ${cursor.ranking_score},
        ${cursor.published_at}::timestamptz,
        ${cursor.id}::uuid
      )`)
  }
  query.append(sql`
    ORDER BY ranking_score DESC, published_at DESC, id DESC
    LIMIT ${safeLimit + 1}`)

  const { rows } = await read(query)
  const hasNextPage = rows.length > safeLimit
  const pageRows = rows.slice(0, safeLimit)

  const results: RssFeedItemsResult[] = pageRows.map(row => ({
    __entity_type: 'rss_feed_item' as const,
    id: row.id as string,
    published_at: row.published_at as Date,
    story_id: (row.story_id as string | null) ?? null,
  }))

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && pageRows.at(-1)
          ? encodeCursor({
              ranking_score: pageRows.at(-1)!.ranking_score as number,
              published_at: pageRows.at(-1)!.cursor_published_at as string,
              id: pageRows.at(-1)!.id as string,
              scope,
            })
          : null,
      start_cursor: pageRows[0]
        ? encodeCursor({
            ranking_score: pageRows[0].ranking_score as number,
            published_at: pageRows[0].cursor_published_at as string,
            id: pageRows[0].id as string,
            scope,
          })
        : null,
    },
  }
}
