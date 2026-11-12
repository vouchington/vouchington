import { clampLimit } from '@services/pagination'
import type { TopicSearchOptions, TopicSearchResult } from './types.mts'
import { buildTopicSearchQueryBody } from './query-builder.mts'
import sql from 'sql-template-strings'
import { detectTopicSort } from '@modules/search-utils'
import { read } from '@data-stores/psql'
import { getCachedSearchEmbedding } from '@services/bedrock-embeddings/search/get-cached'
import { getTopicSearchState } from './query-builder-state.mts'
import createHttpError from 'http-errors'
import { isUUID } from '@modules/utils'
import { buildTopicSearchPageInfo, decodeTopicSearchCursor } from './get-ids-page-info.mts'
import type { TopicSearchRow } from './get-ids-types.mts'
import {
  assertActiveLinkCountSortStandsAlone,
  readActiveLinkCountTopicPage,
} from './link-count-page.mts'

type TopicSearchResponse = {
  results: TopicSearchResult[]
  page_info: ReturnType<typeof buildTopicSearchPageInfo>
}

export async function getTopicIds(options: TopicSearchOptions = {}): Promise<TopicSearchResponse> {
  if (options.similar_rss_feed_item_id !== undefined && !isUUID(options.similar_rss_feed_item_id)) {
    throw createHttpError(400, 'similar_rss_feed_item_id must be a valid UUID')
  }
  const limit = clampLimit(options.limit)
  const sort = detectTopicSort(options)
  if (sort === 'link_count') {
    assertActiveLinkCountSortStandsAlone(options)
    const page = await readActiveLinkCountTopicPage({ limit, after: options.after })
    const resultRows: TopicSearchRow[] = page.rows.map(row => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      topic_type: row.topic_type,
      sort_score: row.active_link_count,
    }))
    return {
      results: resultRows.map(row => ({
        __entity_type: 'topic' as const,
        id: row.id,
        name: row.name,
        slug: row.slug,
        topic_type: row.topic_type,
      })),
      page_info: buildTopicSearchPageInfo(resultRows, page.hasNextPage, sort, {
        hasSemanticSearch: false,
        hasSemanticSignal: false,
        hasSimilarPostSearch: false,
        hasSimilarRssFeedItemSearch: false,
        hasSimilarTopicSearch: false,
        hasTextSearch: false,
        useSemanticRelevanceRanking: false,
      }),
    }
  }

  // Fetch embedding BEFORE building state and decoding the cursor so that
  // getTopicSearchState sees the resolved embedding — the same input the
  // query builder uses when deciding whether to SELECT ranking_score.
  let semanticSearchEmbedding: number[] | undefined
  if (options.semantic_search_query?.trim()) {
    semanticSearchEmbedding = await getCachedSearchEmbedding(options.semantic_search_query.trim())
  }

  // Build the single canonical state that both the cursor logic and the query
  // builder use, ensuring the cursor type always matches the SQL SELECT list.
  const state = getTopicSearchState({ ...options, semanticSearchEmbedding }, sort)

  const { id_lt, tier_after, ranking_lt, score_lt } = decodeTopicSearchCursor(options, sort, state)

  // Build query with decoded cursor and limit + 1
  const body = buildTopicSearchQueryBody(
    {
      ...options,
      semanticSearchEmbedding,
      id_lt,
      tier_after,
      ranking_lt,
      score_lt,
      limit: limit + 1,
    },
    sort,
  )
  const query = sql`/* buildTopicSearchQuery */`
  query.append(body)

  const { rows } = await read(query)
  const typedRows = rows as TopicSearchRow[]

  // Detect if there's a next page
  const hasNextPage = typedRows.length > limit
  const resultRows = typedRows.slice(0, limit)

  // Map results WITHOUT cursor metadata
  const results: TopicSearchResult[] = resultRows.map(row => ({
    __entity_type: 'topic',
    id: row.id,
    name: row.name,
    slug: row.slug,
    topic_type: row.topic_type,
  }))

  return {
    results,
    page_info: buildTopicSearchPageInfo(resultRows, hasNextPage, sort, state),
  }
}
