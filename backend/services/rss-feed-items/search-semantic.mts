import { clampLimit } from '@services/pagination'
/**
 * Semantic (embedding-based) search for RSS feed items.
 * Activated when `semantic_search_query` is provided to the public API.
 * Results are ordered by embedding cosine similarity, not recency.
 * Results use a scoped relevance cursor so callers can traverse stable result pages.
 *
 * For the recency-ordered public search, see search.mts.
 */
import { encodeCursor } from '@modules/pagination'
import {
  getCachedSearchEmbedding,
  normalizeSearchEmbeddingQuery,
} from '@services/bedrock-embeddings/search/get-cached'
import type { PageInfo } from '@voucha/types/pagination'
import type { RssFeedItemsResult } from './types.mts'
import { buildRssFeedItemFilters } from './search-filters.mts'
import type { SearchRssFeedItemsOptions } from './search-types.mts'
import {
  getSemanticRssFeedItemCursor,
  getSemanticRssFeedItemCursorScope,
} from './search-semantic-cursor.mts'
import { buildSemanticRssSearchQuery, executeSemanticRssQuery } from './search-semantic-query.mts'

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
  const isUnscoped = (options.rss_feed_ids?.length ?? 0) === 0

  const semanticSearchEmbedding = await dependencies.getCachedSearchEmbedding(
    normalizeSearchEmbeddingQuery(semantic_search_query),
  )

  // The recency path's timestamp cursor must never leak into relevance search.
  const { after: _after, ...filterOptions } = options
  const baseFilters = buildRssFeedItemFilters(filterOptions)
  const query = buildSemanticRssSearchQuery({
    embedding: semanticSearchEmbedding,
    baseFilters,
    isUnscoped,
    cursor,
    safeLimit,
  })

  const rows = await executeSemanticRssQuery(query, isUnscoped)
  const hasNextPage = rows.length > safeLimit
  const pageRows = rows.slice(0, safeLimit)

  const results: RssFeedItemsResult[] = pageRows.map(row => ({
    __entity_type: 'rss_feed_item' as const,
    id: row.id,
    published_at: row.published_at,
    story_id: row.story_id ?? null,
  }))

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && pageRows.at(-1)
          ? encodeCursor({
              ranking_score: pageRows.at(-1)!.ranking_score,
              published_at: pageRows.at(-1)!.cursor_published_at,
              id: pageRows.at(-1)!.id,
              scope,
            })
          : null,
      start_cursor: pageRows[0]
        ? encodeCursor({
            ranking_score: pageRows[0].ranking_score,
            published_at: pageRows[0].cursor_published_at,
            id: pageRows[0].id,
            scope,
          })
        : null,
    },
  }
}
