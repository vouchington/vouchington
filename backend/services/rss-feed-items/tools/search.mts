import { read } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import { buildEmbeddingCtes, clampLimit, EMBEDDING_DISTANCE_THRESHOLD } from '@modules/search-utils'
import { getCachedSearchEmbedding } from '@services/bedrock-embeddings/search/get-cached'
import pgvector from 'pgvector/pg'
import sql, { type SQLStatement } from 'sql-template-strings'
import { buildRssFeedItemRelevanceScoreExpression } from './search-relevance-score.mts'
import { buildExcludedCTE, buildExcludedHostnameIdsCTE } from '@services/crawls/sql-builders/index'
import createHttpError from 'http-errors'
const TOOLS_SEARCH_RSS_FEED_ITEMS_MAX_LIMIT = 25
type ToolsSearchRssFeedItemIdsOptions = {
  limit?: number
  text_search_query?: string
  semantic_search_query?: string
  similar_post_id?: string
  similar_topic_id?: string
  similar_rss_feed_item_id?: string
  exclude_for_user_id?: string
  dependencies?: Partial<ToolsSearchRssFeedItemIdsDependencies>
}
type ToolsSearchRssFeedItemIdsDependencies = {
  getCachedSearchEmbedding: typeof getCachedSearchEmbedding
}
const defaultDependencies: ToolsSearchRssFeedItemIdsDependencies = { getCachedSearchEmbedding }
type SearchRssFeedItemIdResult = {
  id: string
}
export async function toolsSearchRssFeedItemIds(
  options: ToolsSearchRssFeedItemIdsOptions = {},
): Promise<SearchRssFeedItemIdResult[]> {
  const dependencies = { ...defaultDependencies, ...options.dependencies }
  if (options.similar_rss_feed_item_id !== undefined && !isUUID(options.similar_rss_feed_item_id)) {
    throw createHttpError(422, 'similar_rss_feed_item_id must be a valid UUID')
  }
  const safeLimit = Math.min(clampLimit(options.limit, 10), TOOLS_SEARCH_RSS_FEED_ITEMS_MAX_LIMIT)
  const textSearchQuery = options.text_search_query?.trim()
  const hasTextSearch = !!textSearchQuery
  let semanticSearchEmbedding: number[] | undefined
  if (options.semantic_search_query?.trim()) {
    semanticSearchEmbedding = await dependencies.getCachedSearchEmbedding(
      options.semantic_search_query.trim(),
    )
  }
  const hasSemanticSearch = semanticSearchEmbedding !== undefined
  const hasSimilarPostSearch = !!options.similar_post_id
  const hasSimilarTopicSearch = !!options.similar_topic_id
  const hasSimilarRssFeedItemSearch = !!options.similar_rss_feed_item_id
  const hasRelevanceSearch =
    hasSemanticSearch ||
    hasSimilarPostSearch ||
    hasSimilarTopicSearch ||
    hasSimilarRssFeedItemSearch
  const query = sql`/* toolsSearchRssFeedItemIds */`
  const ctes: SQLStatement[] = []
  ctes.push(
    ...buildEmbeddingCtes({
      semanticSearchEmbeddingVector: semanticSearchEmbedding
        ? (pgvector.toSql(semanticSearchEmbedding) ?? undefined)
        : undefined,
      similar_post_id: options.similar_post_id,
      similar_topic_id: options.similar_topic_id,
      similar_rss_feed_item_id: options.similar_rss_feed_item_id,
    }),
  )
  if (options.exclude_for_user_id) {
    ctes.push(
      buildExcludedCTE(
        options.exclude_for_user_id,
        {
          relationTable: 'relation__user__mute__topic',
          idColumn: 'topic_id',
          cteAlias: 'excluded_topics',
        },
        ['relation__user__block__topic'],
      ),
    )
    ctes.push(
      buildExcludedCTE(
        options.exclude_for_user_id,
        {
          relationTable: 'relation__user__mute__rss_feed',
          idColumn: 'rss_feed_id',
          cteAlias: 'excluded_rss_feeds',
        },
        [],
      ),
    )
    ctes.push(buildExcludedHostnameIdsCTE(options.exclude_for_user_id))
  }
  if (ctes.length > 0) {
    query.append(sql`WITH `)
    ctes.forEach((cte, index) => {
      if (index > 0) query.append(sql`, `)
      query.append(cte)
    })
    query.append(sql` `)
  }
  query.append(sql`
    SELECT
      rss_feed_items.id`)
  if (hasRelevanceSearch) {
    query.append(sql`,\n      `)
    query.append(
      buildRssFeedItemRelevanceScoreExpression({
        hasSemanticSearch,
        hasSimilarPostSearch,
        hasSimilarTopicSearch,
        hasSimilarRssFeedItemSearch,
      }),
    )
    query.append(sql` AS ranking_score`)
  }
  query.append(sql`\n    FROM rss_feed_items`)
  if (hasSemanticSearch) query.append(sql` CROSS JOIN semantic_search_embedding`)
  if (hasSimilarPostSearch) query.append(sql` CROSS JOIN similar_post_embedding`)
  if (hasSimilarTopicSearch) query.append(sql` CROSS JOIN similar_topic_embedding`)
  if (hasSimilarRssFeedItemSearch) query.append(sql` CROSS JOIN similar_rss_feed_item_embedding`)
  const whereClauses: SQLStatement[] = [sql`rss_feed_items.deleted_at IS NULL`]
  if (hasTextSearch) {
    whereClauses.push(
      sql`rss_feed_items.search_vector @@ websearch_to_tsquery('voucha_english', ${textSearchQuery!})`,
    )
  }
  if (hasRelevanceSearch) {
    whereClauses.push(sql`rss_feed_items.bedrock_nova_multimodal_v1_embedding IS NOT NULL`)
  }
  if (hasSemanticSearch) {
    whereClauses.push(
      sql`(rss_feed_items.bedrock_nova_multimodal_v1_embedding <=> semantic_search_embedding.embedding) < ${EMBEDDING_DISTANCE_THRESHOLD}`,
    )
  }
  if (hasSimilarPostSearch) {
    whereClauses.push(
      sql`(rss_feed_items.bedrock_nova_multimodal_v1_embedding <=> similar_post_embedding.embedding) < ${EMBEDDING_DISTANCE_THRESHOLD}`,
    )
  }
  if (hasSimilarTopicSearch) {
    whereClauses.push(
      sql`(rss_feed_items.bedrock_nova_multimodal_v1_embedding <=> similar_topic_embedding.embedding) < ${EMBEDDING_DISTANCE_THRESHOLD}`,
    )
  }
  if (hasSimilarRssFeedItemSearch) {
    whereClauses.push(
      sql`(rss_feed_items.bedrock_nova_multimodal_v1_embedding <=> similar_rss_feed_item_embedding.embedding) < ${EMBEDDING_DISTANCE_THRESHOLD}`,
    )
    whereClauses.push(sql`rss_feed_items.id != ${options.similar_rss_feed_item_id!}::uuid`)
  }

  if (options.exclude_for_user_id) {
    whereClauses.push(sql`NOT EXISTS (
      SELECT 1
      FROM rss_feed_item_sources rfis
      JOIN excluded_rss_feeds ON excluded_rss_feeds.rss_feed_id = rfis.rss_feed_id
      WHERE rfis.rss_feed_item_id = rss_feed_items.id
    )`)
    whereClauses.push(sql`NOT EXISTS (
      SELECT 1
      FROM relation__rss_feed_item__category__topic rfict
      JOIN excluded_topics ON excluded_topics.topic_id = rfict.object_id
      WHERE rfict.subject_id = rss_feed_items.id
        AND rfict.deleted_at IS NULL
        AND rfict.votes_score_net > 0
    )`)
    whereClauses.push(sql`NOT EXISTS (
      SELECT 1
      FROM urls
      WHERE urls.id = rss_feed_items.url_id
        AND urls.hostname_id IN (SELECT hostname_id FROM excluded_hostname_ids)
    )`)
  }

  appendWhereClauses(query, whereClauses)

  if (hasRelevanceSearch) {
    query.append(sql`
      ORDER BY ranking_score DESC, rss_feed_items.published_at DESC NULLS LAST, rss_feed_items.id DESC
    `)
  } else {
    query.append(sql`
      ORDER BY rss_feed_items.published_at DESC NULLS LAST, rss_feed_items.id DESC
    `)
  }

  query.append(sql` LIMIT ${safeLimit}`)

  const { rows } = await read(query)

  return rows.map(row => ({ id: row.id as string }))
}

function appendWhereClauses(query: SQLStatement, whereClauses: SQLStatement[]) {
  if (whereClauses.length === 0) return

  query.append(sql` WHERE `)
  whereClauses.forEach((clause, index) => {
    if (index > 0) query.append(sql` AND `)
    query.append(clause)
  })
}
