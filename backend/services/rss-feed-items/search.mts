/**
 * RSS feed item search sorted by published_at.
 * Supports optional text search via the `text_search_query` option.
 * When `semantic_search_query` is provided, delegates to searchRssFeedItemsBySemantic
 * for embedding-ranked results with relevance cursor pagination.
 *
 * For agent-tool similarity search (similar_post_id, etc.), see tools/search.mts.
 */
import { read } from '@data-stores/psql'
import type { RssFeedItemsResult } from './types.mts'
import { clampLimit } from '@modules/search-utils'
import sql, { type SQLStatement } from 'sql-template-strings'
import { encodeCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { buildRssFeedItemFilters, appendWhereClauses } from './search-filters.mts'
import { searchRssFeedItemsBySemantic } from './search-semantic.mts'
import type { getCachedSearchEmbedding } from '@services/bedrock-embeddings/search/get-cached'

type SearchRssFeedItemsDependencies = {
  getCachedSearchEmbedding: typeof getCachedSearchEmbedding
}

export type SearchRssFeedItemsOptions = {
  rss_feed_ids?: string[]
  topic_ids?: string[]
  category_topic_ids?: string[]
  hashtag_topic_ids?: string[]
  hashtag_alias_ids?: string[]
  story_id?: string
  limit?: number
  after?: string
  has_related_posts?: boolean
  media_types?: Array<'article' | 'audio' | 'video'>
  text_search_query?: string
  /** When set, returns embedding-ranked results instead of recency ordering. */
  semantic_search_query?: string
  /** Filter by read state. Requires currentUserId. */
  read?: boolean
  /** Used with `read` to filter by the current user's read states. */
  currentUserId?: string
  /** Internal viewer role flag for post-relationship discovery. */
  isAdministrator?: boolean
  dependencies?: Partial<SearchRssFeedItemsDependencies>
}

export async function searchRssFeedItems(options: SearchRssFeedItemsOptions = {}): Promise<{
  results: RssFeedItemsResult[]
  page_info: PageInfo
}> {
  if (options.semantic_search_query?.trim()) {
    // Semantic search ignores text search, but owns `after` with a relevance cursor.
    const { text_search_query: _text, ...rest } = options
    return searchRssFeedItemsBySemantic({
      ...rest,
      semantic_search_query: options.semantic_search_query,
      dependencies: options.dependencies,
    })
  }

  const { limit = 10 } = options
  const safeLimit = clampLimit(limit)
  const filters = buildRssFeedItemFilters(options)
  const winnerFilters = buildRssFeedItemFilters({ ...options, after: undefined })
  const query = sql`/* searchRssFeedItems */
    WITH eligible_rss_feed_items AS NOT MATERIALIZED (
      SELECT
        rss_feed_items.id,
        rss_feed_items.published_at,
        rss_feed_items.story_id,
        rss_feed_items.votes_score_net
      FROM rss_feed_items
  `
  appendWhereClauses(query, filters)
  query.append(sql`
    ),
    deduped_rss_feed_items AS (
      SELECT
        eligible_rss_feed_items.id,
        eligible_rss_feed_items.published_at,
        eligible_rss_feed_items.story_id
      FROM eligible_rss_feed_items
      LEFT JOIN LATERAL (
        SELECT rss_feed_items.id
        FROM rss_feed_items
        LEFT JOIN stories winner_story
          ON winner_story.id = rss_feed_items.story_id AND winner_story.deleted_at IS NULL
        WHERE rss_feed_items.story_id = eligible_rss_feed_items.story_id
  `)
  winnerFilters.forEach(filter => query.append(sql` AND `).append(filter))
  query.append(sql`
        ORDER BY
          CASE WHEN winner_story.official_rss_feed_item_id = rss_feed_items.id THEN 1 ELSE 0 END DESC,
          COALESCE(rss_feed_items.votes_score_net, 0) DESC,
          rss_feed_items.id DESC
        LIMIT 1
      ) winner ON eligible_rss_feed_items.story_id IS NOT NULL
      WHERE eligible_rss_feed_items.story_id IS NULL OR winner.id = eligible_rss_feed_items.id
    ),
    limited_rss_feed_items AS (
      SELECT deduped_rss_feed_items.*
      FROM deduped_rss_feed_items
  `)
  appendRssFeedItemsPageClauses(query, safeLimit)

  const { rows } = await read(query)
  const hasNextPage = rows.some(row => row.has_next_page === true)

  const results = rows.map(row => ({
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
        hasNextPage && results.length > 0
          ? encodeCursor({
              timestamp: results[results.length - 1].published_at.getTime(),
              id: results[results.length - 1].id,
            })
          : null,
      start_cursor:
        results.length > 0
          ? encodeCursor({
              timestamp: results[0].published_at.getTime(),
              id: results[0].id,
            })
          : null,
    },
  }
}

export function appendRssFeedItemsPageClauses(query: SQLStatement, safeLimit: number) {
  query.append(sql`
      ORDER BY deduped_rss_feed_items.published_at DESC, deduped_rss_feed_items.id DESC
      LIMIT `)
  query.append(String(safeLimit + 1))
  query.append(sql`
    ),
    rss_feed_items_page_info AS (
      SELECT COUNT(*)::int > `)
  query.append(String(safeLimit))
  query.append(sql` AS has_next_page
      FROM limited_rss_feed_items
    )
    SELECT
      limited_rss_feed_items.id,
      limited_rss_feed_items.published_at,
      limited_rss_feed_items.story_id,
      rss_feed_items_page_info.has_next_page
    FROM limited_rss_feed_items
    CROSS JOIN rss_feed_items_page_info
    ORDER BY limited_rss_feed_items.published_at DESC, limited_rss_feed_items.id DESC
    LIMIT `)
  query.append(String(safeLimit))
}
